/**
 * GameState.js
 * 遊戲狀態管理器（狀態機版本）
 */

import { MahjongLogic } from './mahjongLogic.js';
import { decomposeHand, selectBestPattern, calculateFu } from "../yakuJudge.js";
import { Scoring } from "../scoring.js";

export class Player {
    constructor(id, name, isCom = true) {
        this.id = id;
        this.name = name;
        this.isCom = isCom;
        this.points = 150000;
        this.resetHand();
    }

    resetHand() {
        this.tepai = [];          // 手牌
        this.fulu = [];           // 副露（目前只用暗槓）
        this.river = [];          // 牌河
        this.isReach = false;     // 是否立直
        this.isParent = false;    // 是否莊家

        // === 為特殊規則預留 ===
        this.riichiWaitSet = null;   // 立直當下的聽牌集合
        this.riichiFuriten = false;  // 立直見逃振聽
    }
}

export class GameState {
    resolveHand(playerIndex, ctx) {
        const player = this.players[playerIndex];
        const tiles = player.tepai;
        const ankanTiles = player.fulu
            .filter(f => f.type === "ankan")
            .map(f => f.tile);

        const patterns = decomposeHand(tiles, ankanTiles);
        const best = selectBestPattern(patterns, ctx);
        const fu = calculateFu(best.pattern, ctx);

        const scoring = new Scoring();
        const score = scoring.scoreHand({
            han: best.han,
            fu,
            yakus: best.yakus,
            yakumanRank: best.yakumanRank,
            isKazoeYakuman: best.isKazoeYakuman,
            isParent: ctx.isParent
        });

        this.lastResult = { best, fu, score };
    }
    
    constructor() {
        this.logic = new MahjongLogic();

        this.players = [
            new Player(0, "玩家 (你)", false),
            new Player(1, "對手 (COM)")
        ];

        this.yama = [];           // 牌山
        this.turn = 0;            // 當前玩家 index
        this.parentIndex = 0;     // 莊家 index

        this.phase = "INIT";
        // INIT | DRAW | PLAYER_DECISION | DISCARD | OPPONENT_RESPONSE | ROUND_END

        this.remainingTurns = 0;  // 你的「9 張摸打」計數器
        this.lastDiscard = null;  // { tile, fromPlayer }

        this.roundContext = {};
        this.actionContext = {};

        this._resetRoundContext();
        this._resetActionContext();
    }

    /* ======================
       初始化一局
       ====================== */
    initKyoku(parentIndex = 0) {
        this.parentIndex = parentIndex;

        this.players.forEach((p, i) => {
            p.resetHand();
            p.isParent = (i === parentIndex);
        });

        // 建立牌山（索子 1s ~ 9s，各 4 張）
        this.yama = [];
        for (let tile = 0; tile <= 8; tile++) {
            for (let i = 0; i < 4; i++) {
                this.yama.push(tile);
            }
        }
        this._shuffle(this.yama);
        console.log("牌山剩餘張數：", this.yama.length);
        // 正確值應該是 36 - (14 + 13) = 9

        // 配牌：親 14，子 13（依你規則）
        this.players.forEach((p, i) => {
            const count = (i === parentIndex) ? 14 : 13;
            for (let j = 0; j < count; j++) {
                p.tepai.push(this.yama.pop());
            }
            p.tepai.sort((a, b) => a - b);
        });

        // 剩餘摸打次數 = 9
        this.remainingTurns = 9;

        this.turn = parentIndex;
        this.phase = "PLAYER_DECISION";
        this.lastDiscard = null;
        this._resetRoundContext();
        this._resetActionContext();
    }

    /* ======================
       UI 專用：合法行為
       ====================== */
    getLegalActions(playerIndex) {
        const player = this.players[playerIndex];
        const actions = {
            canTsumo: false,
            canRon: false,
            canRiichi: false,
            canAnkan: false,
            canCancel: false
        };

        // 自己回合
        if (this.turn === playerIndex) {
            if (this.phase === "PLAYER_DECISION") {
                actions.canTsumo = true;
                actions.canCancel = true;

                if (!player.isReach) {
                    actions.canRiichi = true;
                }

                // 暗槓：由 mahjongLogic 統一判斷
                // - 未立直：只需存在四張相同牌
                // - 已立直：暗槓後的聽牌集合必須與立直當下完全一致
                actions.canAnkan = this.logic.canAnkan(player.tepai, player.isReach ? player.riichiWaitSet : null);
            }
        }

        // 對手出牌後 → 榮和一定顯示（即使錯和）
        if (
            this.phase === "OPPONENT_RESPONSE" &&
            this.lastDiscard &&
            playerIndex === 0 // 先只讓玩家能榮和
        ) {
            actions.canRon = true;
            actions.canCancel = true;
        }

        return actions;
    }

    /* ======================
       唯一行為入口
       ====================== */
    applyAction(playerIndex, action) {
        const player = this.players[playerIndex];

        switch (action.type) {
            case "TSUMO":
                this._handleTsumo(playerIndex);
                break;

            case "RON":
                this._handleRon(playerIndex);
                break;

            case "RIICHI":
                this._handleRiichi(playerIndex);
                break;

            case "ANKAN":
                this._handleAnkan(playerIndex, action.tile);
                break;

            case "CANCEL":
                this._handleCancel(playerIndex);
                break;
        }
    }

    /* ======================
       行為實作（先留骨架）
       ====================== */

    _handleTsumo(playerIndex) {
        const player = this.players[playerIndex];
        const isWin = this.logic.isWinningHand(player.tepai);
        
        if (!isWin) {
            this._handleChombo(playerIndex, "錯自摸");
            return;
        }

        // === 特殊役判定（先寫進 roundContext） ===
        if (player.isParent && this.remainingTurns === 9 && !this.roundContext.hasKan) {
            this.roundContext.tenhou = true;
        }

        if (!player.isParent && this.remainingTurns === 8 && !this.roundContext.hasKan) {
            this.roundContext.chiihou = true;
        }

        if (this.yama.length === 0 && !this.actionContext.isAfterKan) {
            this.roundContext.haitei = true;
        }

        const winTile = player.tepai[player.tepai.length - 1];
        const winContext = this._buildWinContext(playerIndex, "tsumo", winTile);
        this.resolveHand(playerIndex, winContext);
        
        console.log(
            winContext.rinshan ? "嶺上開花" : "自摸和",
            this.lastResult
        );
        
        this.phase = "ROUND_END";
        this._resetActionContext();
    }

    _isDiscardFuriten(player) {
        const waits = this.logic.getWaitTiles(player.tepai);
        return [...waits].some(tile => player.river.includes(tile));
    }

    _handleRon(playerIndex) {
        const player = this.players[playerIndex];
        const tile = this.lastDiscard.tile;

        // === 振聽檢查 ===
        if (this._isDiscardFuriten(player) || player.riichiFuriten) {
            this._handleChombo(playerIndex, "振聽榮和");
            return;
        }

        // === 牌型檢查 ===
        const hand = [...player.tepai, tile];
        const isWin = this.logic.isWinningHand(hand);

        if (!isWin) {
            this._handleChombo(playerIndex, "錯榮和");
            return;
        }

        // === 特殊役 ===
        if (!player.isParent && this.remainingTurns === 9 && !this.roundContext.hasKan) {
            this.roundContext.renhou = true;
        }

        if (this.yama.length === 0 && !this.actionContext.isAfterKan) {
            this.roundContext.houtei = true;
        }

        const winContext = this._buildWinContext(playerIndex, "ron", tile);
        this.resolveHand(playerIndex, winContext);

        console.log("榮和", this.lastResult);

        this.phase = "ROUND_END";
        this._resetActionContext();
    }

    _handleRiichi(playerIndex) {
        const player = this.players[playerIndex];
        player.isReach = true;
        player.riichiWaitSet = this.logic.getWaitTiles(player.tepai);

        const needRemaining = player.isParent ? 9 : 8;

        if (this.remainingTurns === needRemaining && !this.roundContext.hasKan) {
            this.roundContext.doubleRiichi = true;
        }

        this.actionContext.lastActionWasRiichi = true;
        this.actionContext.ippatsuActive = true;
        this.actionContext.ippatsuBroken = false;
    }

    _handleAnkan(playerIndex, tile) {
        const player = this.players[playerIndex];

        // 1. 移除四張槓牌
        for (let i = player.tepai.length - 1; i >= 0; i--) {
            if (player.tepai[i] === tile) {
                player.tepai.splice(i, 1);
            }
        }

        player.fulu.push({ type: "ankan", tile });

        // 2. 標記「槓後狀態」
        this.roundContext.hasKan = true;
        this.actionContext.isAfterKan = true;
        this.actionContext.lastActionWasKan = true;
        this.actionContext.ippatsuActive = false;
        this.actionContext.ippatsuBroken = true;

        // 3. 補牌（直接摸牌山）
        this._draw(playerIndex);

        console.log("暗槓成立，補牌");
    }

    _handleCancel(playerIndex) {
        // 見逃：若已立直 → 振聽
        const player = this.players[playerIndex];
        if (player.isReach && this.phase === "OPPONENT_RESPONSE") {
            player.riichiFuriten = true;
        }

        this._advanceAfterResponse();
    }

    /* ======================
       流程推進
       ====================== */
    playerDiscard(playerIndex, tileIndex) {
        const player = this.players[playerIndex];
        const tile = player.tepai.splice(tileIndex, 1)[0];
        player.river.push(tile);

        // 偵測是否為立直宣言牌
        this.actionContext.isTsubameCandidate = this.actionContext.lastActionWasRiichi;
        this.actionContext.lastActionWasRiichi = false;
    
        this.lastDiscard = { tile, fromPlayer: playerIndex };

        // 如果上一動作是槓 → 這張是槓振候補
        this.actionContext.isKanburiCandidate = this.actionContext.lastActionWasKan;

        // 槓只影響一次
        this.actionContext.lastActionWasKan = false;
        
        this.phase = "OPPONENT_RESPONSE";
        
        if (this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
        }
    }

    _advanceAfterResponse() {
        this.remainingTurns--;

        if (this.remainingTurns <= 0) {
            this._handleRyuukyoku();
            return;
        }

        this.turn = (this.turn + 1) % 2;
        this._draw(this.turn);
    }

    _draw(playerIndex) {
        const tile = this.yama.pop();
        this.players[playerIndex].tepai.push(tile);
        this.players[playerIndex].tepai.sort((a, b) => a - b);

        // 先保留「是否槓後補牌」狀態
        const afterKan = this.actionContext.isAfterKan;

        // 每次摸牌都刷新 actionContext（避免殘留）
        this._resetActionContext();

        // 如果這次摸牌是槓後補牌，把 afterKan 設回來，讓本回合能判「嶺上」
        if (afterKan) this.actionContext.isAfterKan = true;

        this.phase = "PLAYER_DECISION";
    }

    _handleRyuukyoku() {
        this.phase = "ROUND_END";
        console.log("流局");

        const parent = this.players[this.parentIndex];

        // === 1. 檢查詐立直（只在流局時） ===
        for (const player of this.players) {
            if (player.isReach) {
                const waits = this.logic.getWaitTiles(player.tepai);

                // 立直但未聽牌 → 詐立直 → チョンボ
                if (waits.size === 0) {
                    this._handleChombo(player.id, "詐立直");
                    return;
                }
            }
        }

        // === 2. 流局未聽：不罰符 ===

        // === 3. 莊家流局未聽 → 流莊 ===
        const parentWaits = this.logic.getWaitTiles(parent.tepai);
        const parentIsTenpai = parentWaits.size > 0;

        if (!parentIsTenpai) {
            this._rotateParent();
        }

        console.log("流局結算完成");
        this._resetActionContext();
        this._resetRoundContext();
    }

    _rotateParent() {
        this.parentIndex = (this.parentIndex + 1) % this.players.length;

        this.players.forEach((p, i) => {
            p.isParent = (i === this.parentIndex);
        });

        console.log("莊家輪替，新莊家：", this.players[this.parentIndex].name);
    }

    _handleChombo(playerIndex, reason) {
        this.phase = "ROUND_END";
        console.warn(`チョンボ：${reason}`);
        this._resetActionContext();
        this._resetRoundContext();
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    _resetActionContext() {
        this.actionContext = {
            isAfterKan: false,
            lastActionWasKan: false,
            lastActionWasRiichi: false,
            ippatsuActive: false,
            ippatsuBroken: false,
            isKanburiCandidate: false,
            isTsubameCandidate: false
        };
    }

    _resetRoundContext() {
        this.roundContext = {
            tenhou: false,
            chiihou: false,
            renhou: false,
            doubleRiichi: false,
            hasKan: false,
            haitei: false,
            houtei: false
        };
    }

    _buildWinContext(playerIndex, winType, winTile) {
        const player = this.players[playerIndex];

        return {
            winType,
            winTile,
            tiles: winType === "tsumo"
                ? [...player.tepai]
                : [...player.tepai, winTile],

            ...this.roundContext,

            ippatsu: this.actionContext.ippatsuActive && !this.actionContext.ippatsuBroken,
            rinshan: this.actionContext.isAfterKan,
            kanburi: this.actionContext.isKanburiCandidate,
            tsubame: this.actionContext.isTsubameCandidate,

            // Player
            riichi: player.isReach,
            isParent: player.isParent
        };
    }
}
