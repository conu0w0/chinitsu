/**
 * gameState.js
 * 遊戲狀態管理器（修正版）
 * 修正了回合切換邏輯與 COM 自動回應機制
 */

import { MahjongLogic } from './mahjongLogic.js';
import { decomposeHand, selectBestPattern, calculateFu } from "./yakuJudge.js";
import { Scoring } from "./scoring.js";

/* ======================
   Player
   ====================== */
export class Player {
    constructor(id, name, isCom = true) {
        this.id = id;
        this.name = name;
        this.isCom = isCom;
        this.points = 150000;
        this.resetHand();
    }

    resetHand() {
        this.tepai = [];
        this.fulu = [];
        this.river = [];
        this.isReach = false;
        this.isParent = false;

        // Riichi related
        this.riichiWaitSet = null;
        this.riichiFuriten = false;
    }
}

/* ======================
   GameState
   ====================== */
export class GameState {
    constructor() {
        this.logic = new MahjongLogic();
        this.animationQueue = [];

        this.players = [
            new Player(0, "玩家 (你)", false),
            new Player(1, "對手 (COM)", true)
        ];

        this.yama = [];
        this.turn = 0;
        this.parentIndex = 0;

        this.phase = "INIT";
        // INIT | DRAW | PLAYER_DECISION | DISCARD | OPPONENT_RESPONSE | ROUND_END

        this.lastDiscard = null;
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

        // 建立牌山：索子 1s~9s 各 4 張 (共 36 張)
        this.yama = [];
        for (let tile = 0; tile <= 8; tile++) {
            for (let i = 0; i < 4; i++) {
                this.yama.push(tile);
            }
        }
        this._shuffle(this.yama);

        // 1. 先發給所有人 13 張，並「理牌」
        this.players.forEach((p) => {
            for (let j = 0; j < 13; j++) {
                p.tepai.push(this.yama.pop());
            }
            // 理牌：這 13 張是整齊的
            p.tepai.sort((a, b) => a - b);
        });

        // 2. 如果是莊家，再摸第 14 張 (放在最右邊，不排序)
        const parent = this.players[parentIndex];
        const firstTsumo = this.yama.pop();
        parent.tepai.push(firstTsumo);

        this.turn = parentIndex;
        this.lastDiscard = null;
        this._resetRoundContext();
        this._resetActionContext();

        console.log(`=== 新局開始 (親: ${parentIndex === 0 ? '玩家' : 'COM'}) ===`);
        console.log("牌山剩餘：", this.yama.length);

        // 決定初始階段
        if (this.turn === 0) {
            // 玩家是親，進入決策階段 (天和/暗槓/打牌)
            this.phase = "PLAYER_DECISION";
        } else {
            // COM 是親，直接讓 COM 思考並出牌
            // (注意：標準規則親家配牌14張視為自摸牌)
            this.phase = "PLAYER_DECISION"; 
            setTimeout(() => this._handleOpponentTurn(), 500);
        }
    }

    /* ======================
       UI：合法行為
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

        // 防呆：非玩家回合且非回應階段，禁止操作
        if (this.turn !== playerIndex && this.phase !== "OPPONENT_RESPONSE") {
            return actions;
        }

        // 1. 自己回合的決策 (摸牌後)
        if (this.phase === "PLAYER_DECISION" && playerIndex === 0) {
            actions.canTsumo = true; // 實際上還需檢查 logic.isWinningHand，UI層通常會再過濾
            actions.canCancel = true; // 這裡的 Cancel 指的是「不宣告自摸/槓/立直，準備出牌」

            if (!player.isReach) actions.canRiichi = true;

            actions.canAnkan = this.yama.length > 0 &&
                this.logic.canAnkan(
                    player.tepai,
                    player.isReach ? player.riichiWaitSet : null
                );
        }

        // 2. 對手打牌後的決策 (榮和)
        if (
            this.phase === "OPPONENT_RESPONSE" &&
            this.lastDiscard &&
            playerIndex === 0
        ) {
            // 這裡可以預先判斷是否真的能胡，優化 UI 顯示
            // const canWin = this.logic.isWinningHand([...player.tepai, this.lastDiscard.tile]);
            // if (canWin) actions.canRon = true;
            
            actions.canRon = true;
            actions.canCancel = true; // 放過 (Skip)
        }

        return actions;
    }

    /* ======================
       行為入口
       ====================== */
    applyAction(playerIndex, action) {
        console.log(`玩家 ${playerIndex} 執行: ${action.type}`, action);
        switch (action.type) {
            case "TSUMO": this._handleTsumo(playerIndex); break;
            case "RON": this._handleRon(playerIndex); break;
            case "RIICHI": this._handleRiichi(playerIndex); break;
            case "ANKAN": this._handleAnkan(playerIndex, action.tile); break;
            case "CANCEL": this._handleCancel(playerIndex); break;
        }
    }

    /* ======================
       和牌處理
       ====================== */
    _handleTsumo(playerIndex) {
        const player = this.players[playerIndex];
        const kanCount = this._getAnkanCount(player);

        if (!this.logic.isWinningHand(player.tepai, kanCount)) {
            this._handleChombo(playerIndex, "誤自摸");
            return;
        }

        const yamaLeft = this.yama.length;
        if (player.isParent && yamaLeft === 9) this.roundContext.tenhou = true;
        if (!player.isParent && yamaLeft === 8) this.roundContext.chiihou = true;
        if (yamaLeft === 0 && !this.actionContext.isAfterKan) this.roundContext.haitei = true;

        const winTile = player.tepai[player.tepai.length - 1];
        const ctx = this._buildWinContext(playerIndex, "tsumo", winTile);
        this.resolveHand(playerIndex, ctx);

        console.log(ctx.rinshan ? "嶺上開花" : "自摸和", this.lastResult);
        this.phase = "ROUND_END";
        this._resetActionContext();
    }

    _handleRon(playerIndex) {
        const player = this.players[playerIndex];
        const tile = this.lastDiscard.tile;

        if (this._isDiscardFuriten(player) || player.riichiFuriten) {
            this._handleChombo(playerIndex, "振聽榮和");
            return;
        }

        const hand = [...player.tepai, tile];
        const kanCount = this._getAnkanCount(player);
        if (!this.logic.isWinningHand(hand, kanCount)) {
            this._handleChombo(playerIndex, "誤榮和");
            return;
        }

        const yamaLeft = this.yama.length;
        if (!player.isParent && yamaLeft === 9) this.roundContext.renhou = true;
        if (yamaLeft === 0 && !this.actionContext.isAfterKan) this.roundContext.houtei = true;

        const ctx = this._buildWinContext(playerIndex, "ron", tile);
        this.resolveHand(playerIndex, ctx);

        console.log("榮和", this.lastResult);
        this.phase = "ROUND_END";
        this._resetActionContext();
    }

    /* ======================
       立直 & 槓 & 取消
       ====================== */
    _handleRiichi(playerIndex) {
        const player = this.players[playerIndex];
        player.isReach = true;
        player.riichiWaitSet = this.logic.getWaitTiles(player.tepai);

        this.actionContext.lastActionWasRiichi = true;
        // 注意：立直後還需要打出一張牌，狀態仍保持 PLAYER_DECISION 或等待 UI 觸發 playerDiscard
    }

    _handleAnkan(playerIndex, tile) {
        const player = this.players[playerIndex];

        // 移除手牌中的 4 張
        let removedCount = 0;
        for (let i = player.tepai.length - 1; i >= 0; i--) {
            if (player.tepai[i] === tile) {
                player.tepai.splice(i, 1);
                removedCount++;
            }
        }

        if (removedCount !== 4) {
             console.error("暗槓錯誤：手牌中張數不足", tile, player.tepai);
             return;
        }

        player.fulu.push({ type: "ankan", tile });

        // 槓 → 一發中斷
        if (this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
            this.actionContext.ippatsuBroken = true;
        }

        this.actionContext.isAfterKan = true;
        this.actionContext.lastActionWasKan = true;

        console.log(`玩家 ${playerIndex} 暗槓 ${tile}`);
        this._draw(playerIndex); // 嶺上補牌
    }

    _handleCancel(playerIndex) {
        const player = this.players[playerIndex];

        // 1. 如果是在自己回合按 Cancel (不想立直/自摸)
        if (this.turn === playerIndex && this.phase === "PLAYER_DECISION") {
            // 這裡什麼都不做，等待玩家點擊牌進行 Discard
            // 除非是立直後的強制 Cancel (不支援，立直必須出牌)
            return;
        }

        // 2. 如果是在對手回合按 Cancel (不想榮和) -> 進入下一輪
        if (this.phase === "OPPONENT_RESPONSE") {
            // 立直宣言牌被放過 → 一發成立條件開始
            if (this.actionContext.lastActionWasRiichi) {
                this.actionContext.ippatsuActive = true;
                this.actionContext.ippatsuBroken = false;
            }

            // 立直見逃 → 振聽
            if (player.isReach) {
                player.riichiFuriten = true;
                console.log("立直見逃，振聽確定");
            }

            console.log("選擇 Skip (不榮和)");
            this._advanceAfterResponse();
        }
    }

    /* ======================
       摸打流程
       ====================== */
    
    // 玩家出牌
    playerDiscard(playerIndex, tileIndex) {
        const player = this.players[playerIndex];

        // 移除指定的牌並自動理牌
        const tile = player.tepai.splice(tileIndex, 1)[0];
        player.tepai.sort((a, b) => a - b);       

        player.river.push({
            tile,
            isRiichi: this.actionContext.lastActionWasRiichi
        });

        // 立直者自己出牌 → 該輪一發機會結束
        if (this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
            this.actionContext.ippatsuBroken = true;
        }

        this.actionContext.lastActionWasRiichi = false;
        this.actionContext.isKanburiCandidate = this.actionContext.lastActionWasKan;
        this.actionContext.lastActionWasKan = false;

        this.lastDiscard = { tile, fromPlayer: playerIndex };
        this.phase = "OPPONENT_RESPONSE";
        
        console.log(`玩家切牌: ${tile + 1}s`);

        // [重要修正] 對手是 COM，自動跳過榮和階段
        if (playerIndex === 0) {
            setTimeout(() => {
                // 未來可在此加入 COM 的榮和判定 (logic.isWinningHand)
                // 目前 COM 總是 Pass
                this._handleComResponse();
            }, 500);
        }
    }

    // 回合推進 (決定下一家是誰)
    _advanceAfterResponse() {
        if (this.yama.length === 0) {
            this._handleRyuukyoku();
            return;
        }

        // 切換回合
        this.turn = (this.turn + 1) % 2;
        
        // 摸牌
        this._draw(this.turn);

        // 如果輪到 COM，執行 COM AI
        if (this.turn === 1) {
            setTimeout(() => this._handleOpponentTurn(), 600);
        }
    }

    _draw(playerIndex) {
        if (this.yama.length === 0) {
             this._handleRyuukyoku();
             return;
        }

        const tile = this.yama.pop();
        const player = this.players[playerIndex];
        player.tepai.push(tile);
        // 注意：為了方便測試，這裡每次摸牌都自動排序，實際遊戲可能只排手中的，摸到的牌放最右邊
        player.tepai.sort((a, b) => a - b);

        const afterKan = this.actionContext.isAfterKan;
        // Reset action flags for the new turn
        this._resetActionContext();
        if (afterKan) this.actionContext.isAfterKan = true; // 嶺上牌標記

        this.phase = "PLAYER_DECISION";
        console.log(`${player.name} 摸牌: ${playerIndex === 0 ? tile : '??'}`);
    }

    /* ======================
       COM 邏輯
       ====================== */
    _handleOpponentTurn() {
        const opp = this.players[1];

        // 簡單 AI：隨機切
        const idx = Math.floor(Math.random() * opp.tepai.length);
        const tile = opp.tepai.splice(idx, 1)[0];

        opp.river.push({ tile, isRiichi: false });

        this.lastDiscard = { tile, fromPlayer: 1 };
        
        // 進入回應階段，等待玩家操作
        this.phase = "OPPONENT_RESPONSE";
        
        console.log("COM 切牌：", `${tile + 1}s`);
    }

   _handleComResponse() {
        console.log("等待 COM 回應...");
        
        setTimeout(() => {
            // TODO: 未來這裡可以加入 AI 判斷
            // if (this.logic.canRon(...)) { this.applyAction(1, { type: 'RON' }); return; }
            
            // 目前測試階段：COM 總是選擇「取消/放過」
            // 注意：我們明確調用 applyAction，就像玩家按下按鈕一樣
            this.applyAction(1, { type: 'CANCEL' });
            
        }, 500); // 模擬思考時間
    }

    /* ======================
       流局 & 雜項
       ====================== */
    _handleRyuukyoku() {
        this.phase = "ROUND_END";
        console.log("=== 流局 ===");
        this._resetActionContext();
        this._resetRoundContext();
    }

    _isDiscardFuriten(player) {
        const waits = this.logic.getWaitTiles(player.tepai);
        // 檢查現物振聽：聽的牌是否在自己河裡
        return [...waits].some(t => player.river.some(r => r.tile === t));
    }

    _handleChombo(playerIndex, reason) {
        this.phase = "ROUND_END";

        const offender = this.players[playerIndex];
        const opponent = this.players[(playerIndex + 1) % 2];

        const base = 32000;
        const payment = offender.isParent ? base * 1.5 : base;

        offender.points -= payment;
        opponent.points += payment;

        this.lastResult = {
            type: "chombo",
            score: { display: `犯規：${reason}`, yakus: [], total: -payment }
        };

        console.warn("犯規發生", reason);
        this._resetActionContext();
        this._resetRoundContext();
    }

   _getAnkanCount(player) {
      return player.fulu.filter(f => f.type === "ankan").length;
   }

    resolveHand(playerIndex, ctx) {
        const player = this.players[playerIndex];
        const ankanTiles = player.fulu
            .filter(f => f.type === "ankan")
            .map(f => f.tile);

        const patterns = decomposeHand(ctx.tiles, ankanTiles);
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
            haitei: false,
            houtei: false
        };
    }

    _buildWinContext(playerIndex, winType, winTile) {
        const player = this.players[playerIndex];

        const waits = player.isReach
            ? player.riichiWaitSet
            : this.logic.getWaitTiles(player.tepai);

        return {
            winType,
            winTile,
            tiles: winType === "tsumo"
                ? [...player.tepai]
                : [...player.tepai, winTile],

            ...this.roundContext,

            waits,

            ippatsu: this.actionContext.ippatsuActive && !this.actionContext.ippatsuBroken,
            rinshan: this.actionContext.isAfterKan,

            riichi: player.isReach,
            isParent: player.isParent
        };
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
