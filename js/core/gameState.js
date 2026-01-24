/**
 * gameState.js
 * 遊戲狀態管理器（狀態機・重構版）
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
            new Player(1, "對手 (COM)")
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

        // 建立牌山：1s~9s 各 4
        this.yama = [];
        for (let tile = 0; tile <= 8; tile++) {
            for (let i = 0; i < 4; i++) {
                this.yama.push(tile);
            }
        }
        this._shuffle(this.yama);

        // 配牌：親 14，子 13
        this.players.forEach((p, i) => {
            const count = (i === parentIndex) ? 14 : 13;
            for (let j = 0; j < count; j++) {
                p.tepai.push(this.yama.pop());
            }
            p.tepai.sort((a, b) => a - b);
        });

        this.turn = parentIndex;
        this.phase = "PLAYER_DECISION";
        this.lastDiscard = null;

        this._resetRoundContext();
        this._resetActionContext();

        console.log("牌山剩餘：", this.yama.length); // 應為 9
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

        if (this.turn === playerIndex && this.phase === "PLAYER_DECISION") {
            actions.canTsumo = true;
            actions.canCancel = true;

            if (!player.isReach) actions.canRiichi = true;

            actions.canAnkan = this.yama.length > 0 &&
                this.logic.canAnkan(
                    player.tepai,
                    player.isReach ? player.riichiWaitSet : null
                );
        }

        if (
            this.phase === "OPPONENT_RESPONSE" &&
            this.lastDiscard &&
            playerIndex === 0
        ) {
            actions.canRon = true;
            actions.canCancel = true;
        }

        return actions;
    }

    /* ======================
       行為入口
       ====================== */
    applyAction(playerIndex, action) {
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

        if (!this.logic.isWinningHand(player.tepai)) {
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
        if (!this.logic.isWinningHand(hand)) {
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
       立直 & 一發
       ====================== */
    _handleRiichi(playerIndex) {
        const player = this.players[playerIndex];
        player.isReach = true;
        player.riichiWaitSet = this.logic.getWaitTiles(player.tepai);

        this.actionContext.lastActionWasRiichi = true;
    }

    _handleCancel(playerIndex) {
        const player = this.players[playerIndex];

        // 立直宣言牌被放過 → 一發開始
        if (this.actionContext.lastActionWasRiichi) {
            this.actionContext.ippatsuActive = true;
            this.actionContext.ippatsuBroken = false;
        }

        if (player.isReach && this.phase === "OPPONENT_RESPONSE") {
            player.riichiFuriten = true;
        }

        this._advanceAfterResponse();
    }

    _handleAnkan(playerIndex, tile) {
        const player = this.players[playerIndex];

        for (let i = player.tepai.length - 1; i >= 0; i--) {
            if (player.tepai[i] === tile) player.tepai.splice(i, 1);
        }

        player.fulu.push({ type: "ankan", tile });

        // 槓 → 一發中斷
        if (this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
            this.actionContext.ippatsuBroken = true;
        }

        this.actionContext.isAfterKan = true;
        this.actionContext.lastActionWasKan = true;

        this._draw(playerIndex);
        console.log("暗槓成立");
    }

    /* ======================
       摸打流程
       ====================== */
    playerDiscard(playerIndex, tileIndex) {
        const player = this.players[playerIndex];
        const tile = player.tepai.splice(tileIndex, 1)[0];

        player.river.push({
            tile,
            isRiichi: this.actionContext.lastActionWasRiichi
        });

        // 立直者自己出牌 → 一發結束
        if (this.actionContext.ippatsuActive) {
            this.actionContext.ippatsuActive = false;
            this.actionContext.ippatsuBroken = true;
        }

        this.actionContext.lastActionWasRiichi = false;
        this.actionContext.isKanburiCandidate = this.actionContext.lastActionWasKan;
        this.actionContext.lastActionWasKan = false;

        this.lastDiscard = { tile, fromPlayer: playerIndex };
        this.phase = "OPPONENT_RESPONSE";
    }

    _advanceAfterResponse() {
        if (this.yama.length === 0) {
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

        const afterKan = this.actionContext.isAfterKan;
        this._resetActionContext();
        if (afterKan) this.actionContext.isAfterKan = true;

        this.phase = "PLAYER_DECISION";
    }

    /* ======================
       流局 & 雜項
       ====================== */
    _handleRyuukyoku() {
        this.phase = "ROUND_END";
        console.log("流局");

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
        const opponent = this.players[(playerIndex + 1) % 2];

        const base = 32000;
        const payment = offender.isParent ? base * 1.5 : base;

        offender.points -= payment;
        opponent.points += payment;

        this.lastResult = {
            type: "chombo",
            score: { display: `チョンボ：${reason}`, yakus: [] }
        };

        console.warn("チョンボ", reason);
        this._resetActionContext();
        this._resetRoundContext();
    }

    resolveHand(playerIndex, ctx) {
        const player = this.players[playerIndex];
        const ankanTiles = player.fulu
            .filter(f => f.type === "ankan")
            .map(f => f.tile);

        const patterns = decomposeHand(player.tepai, ankanTiles);
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

        return {
            winType,
            winTile,
            tiles: winType === "tsumo"
                ? [...player.tepai]
                : [...player.tepai, winTile],

            ...this.roundContext,

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
