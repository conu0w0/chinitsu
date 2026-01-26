/**
 * gameState.js
 * 遊戲狀態管理器 (Updated with UI Layering Logic)
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
            new Player(0, "玩家", false),
            new Player(1, "COM", true)
        ];

        this.yama = [];
        this.turn = 0;
        this.parentIndex = 0;

        // 核心狀態 Phase
        // INIT | DRAW 
        // PLAYER_DECISION (Root層) | ANKAN_SELECTION (槓層) | RIICHI_DECLARATION (立直層)
        // DISCARD_ONLY (只能切牌)
        // REACTION_DECISION (回應層) | ROUND_END
        this.phase = "INIT";

        this.lastDiscard = null;
        this.lastResult = null;
        this.roundContext = {};
        this.actionContext = {};

        this._resetRoundContext();
        this._resetActionContext();
    }

    /* ======================
       初始化一局
       ====================== */
    initKyoku(parentIndex = 0) {
        this.lastResult = null;
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

        // 1. 發牌 (13張)
        this.players.forEach((p) => {
            for (let j = 0; j < 13; j++) {
                p.tepai.push(this.yama.pop());
            }
            p.tepai.sort((a, b) => a - b);
        });

        // 2. 莊家摸第 14 張
        const parent = this.players[parentIndex];
        const firstTsumo = this.yama.pop();
        parent.tepai.push(firstTsumo);

        this.turn = parentIndex;
        this.lastDiscard = null;
        this._resetRoundContext();
        this._resetActionContext();

        console.log(`=== 新局開始 (親: ${parentIndex === 0 ? '玩家' : 'COM'}) ===`);

        // 決定初始階段
        if (this.turn === 0) {
            this.phase = "PLAYER_DECISION";
        } else {
            // COM 行動
            this.phase = "PLAYER_DECISION";
            setTimeout(() => this._handleComTurn(), 500);
        }
    }

    /* ======================
       UI：合法行為查詢
       ====================== */
    getLegalActions(playerIndex) {
        const player = this.players[playerIndex];
        const actions = {
            canTsumo: false,
            canRon: false,
            canRiichi: false,
            canAnkan: false,
            ankanTiles: [],
            canCancel: false
        };

        // 非當前玩家或非回應階段 -> 禁止操作
        if (this.turn !== playerIndex && this.phase !== "REACTION_DECISION") {
            return actions;
        }

        // === 1. 自己回合的決策 (Root 層) ===
        if (this.phase === "PLAYER_DECISION" && playerIndex === 0) {
            // 自摸判定
            actions.canTsumo = true;

            // 暗槓判定
            if (this.yama.length > 0) {
                const waitSet = player.isReach ? player.riichiWaitSet : null;
                actions.ankanTiles = this.logic.getAnkanTiles(player.tepai, this._getAnkanCount(player), waitSet);
                actions.canAnkan = (actions.ankanTiles.length > 0);
            }

            // 立直判定 (門前清 + 未立直)
            if (!player.isReach && player.fulu.length === 0) { // 這裡簡化判斷，實際應檢查是否門清
                const waits = this.logic.getWaitTiles(player.tepai);
                actions.canRiichi = true;
            }

            // 在 Root 層，Cancel 意味著「跳過所有特殊動作，去切牌」
            actions.canCancel = true;
        }

        // === 2. 對手打牌後的決策 (榮和) ===
        if (this.phase === "REACTION_DECISION" && this.lastDiscard && playerIndex === 0) {
            actions.canRon = true;
            actions.canCancel = true;
        }

        return actions;
    }

    /* ======================
       行為入口 (State Machine Core)
       ====================== */
    applyAction(playerIndex, action) {
        const type = action.type;
        const player = this.players[playerIndex];

        switch (this.phase) {

            /* ======================
               ROOT 層：玩家決策
               ====================== */
            case "PLAYER_DECISION":
                {
                    if (type === "TSUMO") {
                        this._handleTsumo(playerIndex);
                        return;
                    }

                    // 嘗試暗槓 -> 進入邏輯判斷
                    if (type === "TRY_ANKAN") {
                        const ankanTiles = this.logic.getAnkanTiles(
                            player.tepai,
                            this._getAnkanCount(player),
                            player.isReach ? player.riichiWaitSet : null
                        );

                        if (ankanTiles.length === 0) return; // 防呆

                        if (ankanTiles.length === 1) {
                            // 只有一種選擇，直接槓
                            this._handleAnkan(playerIndex, ankanTiles[0]);
                        } else {
                            // 多種選擇，進入子選單
                            this.phase = "ANKAN_SELECTION";
                        }
                        return;
                    }

                    // 立直 -> 進入立直宣言層
                    if (type === "RIICHI") {
                        this.phase = "RIICHI_DECLARATION";
                        // 註：此時還未扣點，也未正式立直，等待切牌確認
                        return;
                    }

                    // 取消 -> 鎖定為只能切牌
                    if (type === "CANCEL") {
                        this.phase = "DISCARD_ONLY";
                        return;
                    }
                    return;
                }

                /* ======================
                   槓層：選擇槓哪一張
                   ====================== */
            case "ANKAN_SELECTION":
                {
                    if (type === "ANKAN") {
                        this._handleAnkan(playerIndex, action.tile);
                        return;
                    }
                    if (type === "CANCEL") {
                        // 返回 Root
                        this.phase = "PLAYER_DECISION";
                        return;
                    }
                    return;
                }

                /* ======================
                   立直層：宣言確認
                   ====================== */
            case "RIICHI_DECLARATION":
                {
                    if (type === "CANCEL") {
                        // 返回 Root
                        this.phase = "PLAYER_DECISION";
                        return;
                    }
                    // 此狀態下點擊手牌會觸發 playerDiscard，那邊會處理立直確立
                    return;
                }

                /* ======================
                   回應層 (榮和/Skip)
                   ====================== */
            case "REACTION_DECISION":
                {
                    if (type === "RON") {
                        this._handleRon(playerIndex);
                        return;
                    }
                    if (type === "CANCEL") {
                        this._handleCancel(playerIndex);
                        return;
                    }
                    return;
                }

            case "DISCARD_ONLY":
            case "ROUND_END":
            default:
                return;
        }
    }

    /* ======================
       摸打流程與切牌處理
       ====================== */

    // 玩家點擊手牌切牌時呼叫此函式
    playerDiscard(playerIndex, tileIndex) {
        const player = this.players[playerIndex];

        // 檢查：如果是在立直宣言狀態下切牌，則確認立直
        let isRiichiDeclarationDiscard = false;

        if (this.phase === "RIICHI_DECLARATION") {
            isRiichiDeclarationDiscard = true;
            this.phase = "PLAYER_DECISION";

            // 執行立直扣點與標記 (先標記 actionContext，出牌後才正式生效)
            this._handleRiichi(playerIndex);

            // 狀態恢復正常流程，準備進入 REACTION
        }

        // 立直後限制：只能切剛摸到的牌
        if (player.isReach && !isRiichiDeclarationDiscard) {
            // 找出剛摸的那張牌 (通常是最後一張)
            const isTsumoTile = (tileIndex === player.tepai.length - 1);
            if (!isTsumoTile) {
                console.warn("立直後只能切摸牌");
                return; // 阻止切牌
            }
        }

        // === 執行切牌 ===
        const tile = player.tepai.splice(tileIndex, 1)[0];
        player.tepai.sort((a, b) => a - b);

        player.river.push({
            tile,
            isRiichi: this.actionContext.pendingRiichi // 標記這張是立直宣言牌
        });

        if (this.actionContext.pendingRiichi) {
            const p = this.players[this.actionContext.pendingRiichiPlayer];

            this.actionContext.lastActionWasRiichi = true;
            this.actionContext.ippatsuActive = true;
            this.actionContext.ippatsuBroken = false;

            this.actionContext.pendingRiichi = false;
            this.actionContext.pendingRiichiPlayer = null;
        }

        if (this.actionContext.lastActionWasRiichi) {
            if (this.roundContext.doubleRiichi) {
                console.log("兩立直成立");
            } else {
                console.log("立直成立");
            }
        }

        // 一發狀態處理
        if (!isRiichiDeclarationDiscard && this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
            this.actionContext.ippatsuBroken = true;
        }

        this.actionContext.lastActionWasRiichi = false; // 重置標記
        this.actionContext.isKanburiCandidate = this.actionContext.lastActionWasKan;
        this.actionContext.lastActionWasKan = false;

        this.lastDiscard = {
            tile,
            fromPlayer: playerIndex
        };
       
        // 切牌後，嶺上資格消失
        this.actionContext.isAfterKan = false;

        this.phase = "REACTION_DECISION";
        console.log(`玩家切牌: ${tile + 1}s`);

        // === 觸發 COM 回應 ===
        if (playerIndex === 0) {
            setTimeout(() => {
                this._handleComResponse();
            }, 500);
        }
    }

    // 回合推進
    _advanceAfterResponse() {
        this.actionContext.isAfterKan = false;

        if (this.yama.length === 0) {
            this._handleRyuukyoku();
            return;
        }

        this.turn = (this.turn + 1) % 2;
        this._draw(this.turn);

        // 如果輪到 COM
        if (this.turn === 1) {
            setTimeout(() => this._handleComTurn(), 600);
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

        const afterKan = this.actionContext.isAfterKan;
        this._resetActionContext();
        if (afterKan) this.actionContext.isAfterKan = true; // 嶺上

        this.phase = "PLAYER_DECISION";
        console.log(`${player.name} 摸牌: ${playerIndex === 0 ? `${tile + 1}s` : '??'}`);
    }

    /* ======================
       動作處理 (Internal)
       ====================== */

    _handleRiichi(playerIndex) {
        this.actionContext.pendingRiichi = true;
        this.actionContext.pendingRiichiPlayer = playerIndex;
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

        player.fulu.push({
            type: "ankan",
            tile
        });
        player.tepai.sort((a, b) => a - b);

        // 一發中斷
        if (this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
            this.actionContext.ippatsuBroken = true;
        }

        this.actionContext.isAfterKan = true;
        this.actionContext.lastActionWasKan = true;

        console.log(`玩家 ${playerIndex} 暗槓 ${tile + 1}s`);

        // 槓完後直接回到 Root (因為摸了嶺上牌，又是一次新的 Decision)
        this.phase = "PLAYER_DECISION";
        this._draw(playerIndex);
    }

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

        console.log(ctx.rinshan ? "嶺上開花" : "自摸", this.lastResult);
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

    _handleCancel(playerIndex) {
        const player = this.players[playerIndex];

        // 這是「榮和階段」的 Cancel (見逃)
        if (this.phase === "REACTION_DECISION") {
            if (this.actionContext.pendingRiichiPlayer !== null) {
               // 1. 抓出宣告立直的那個人 (通常是上一家)
               const riichiPlayerIndex = this.actionContext.pendingRiichiPlayer;
               const p = this.players[riichiPlayerIndex]; // 定義 p

               if(p) {
                  // 2. 鎖定立直狀態
                  p.isReach = true;

                  // 3. 鎖定立直後的聽牌列表 (為了之後檢查振聽)
                  p.riichiWaitSet = this.logic.getWaitTiles(p.tepai);

                  // 4. 設定一發狀態
                  this.actionContext.ippatsuActive = true;
                  this.actionContext.ippatsuBroken = false;

                  // 5. 清除 pending 狀態
                  this.actionContext.pendingRiichi = false;
                  this.actionContext.pendingRiichiPlayer = null;

                  if (this.roundContext.doubleRiichi) {
                      console.log("兩立直成立");
                  } else {
                      console.log("立直成立 (不扣點)");
                  }
               }
            }

            // 處理立直振聽
            if (player.isReach && player.riichiWaitSet && player.riichiWaitSet.has(this.lastDiscard.tile)) {
                player.riichiFuriten = true;
                console.log("立直振聽 (見逃)");
            }

            console.log("選擇 Skip (不榮和)");
            this._advanceAfterResponse();
        }
    }

    /* ======================
       COM 邏輯
       ====================== */

    _handleComTurn() {
        const com = this.players[1];
        // 簡單 AI：隨機切
        const idx = Math.floor(Math.random() * com.tepai.length);
        const tile = com.tepai.splice(idx, 1)[0];
        com.river.push({
            tile,
            isRiichi: false
        });

        this.lastDiscard = {
            tile,
            fromPlayer: 1
        };
        this.phase = "REACTION_DECISION";
        console.log("COM 切牌：", `${tile + 1}s`);
    }

    _handleComResponse() {
        // COM 總是 Pass
        this.applyAction(1, {
            type: 'CANCEL'
        });
    }

    /* ======================
       Helpers & Utility
       ====================== */

    _handleRyuukyoku() {
        this.phase = "ROUND_END";
        this.lastResult = { type: "ryuukyoku" };
        console.log("=== 流局 ===");
        this._resetActionContext();
        this._resetRoundContext();
    }

    _isDiscardFuriten(player) {
        const waits = this.logic.getWaitTiles(player.tepai);
        return [...waits].some(t => player.river.some(r => r.tile === t));
    }

    _handleChombo(playerIndex, reason) {
        this.phase = "ROUND_END";
        const offender = this.players[playerIndex];
        const base = 32000;
        offender.points -= base;

        this.lastResult = {
            type: "chombo",
            score: {
                display: `犯規：${reason}`,
                total: -base
            }
        };
        console.warn("犯規發生", reason);
    }

    _getAnkanCount(player) {
        return player.fulu.filter(f => f.type === "ankan").length;
    }

    resolveHand(playerIndex, ctx) {
        const player = this.players[playerIndex];
        const ankanTiles = player.fulu.filter(f => f.type === "ankan").map(f => f.tile);

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

        this.lastResult = {
            best,
            fu,
            score: {
                ...score,
                total: score.score
            }
        };
    }

    _resetActionContext() {
        this.actionContext = {
            isAfterKan: false,
            lastActionWasKan: false,
            pendingRiichi: false,
            pendingRiichiPlayer: null,
            lastActionWasRiichi: false,
            ippatsuActive: false,
            ippatsuBroken: false,
            isKanburiCandidate: false
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
        const waits = player.isReach ? player.riichiWaitSet : this.logic.getWaitTiles(player.tepai);

        return {
            winType,
            winTile,
            tiles: winType === "tsumo" ? [...player.tepai] : [...player.tepai, winTile],
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
