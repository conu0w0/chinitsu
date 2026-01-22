/**
 * GameState.js
 * 遊戲狀態管理器（狀態機版本）
 */

import { MahjongLogic } from './mahjongLogic.js';

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

        this.phase = "ROUND_END";
        console.log("自摸和");
    }

    _handleRon(playerIndex) {
        const player = this.players[playerIndex];
        const tile = this.lastDiscard.tile;

        const hand = [...player.tepai, tile];
        const isWin = this.logic.isWinningHand(hand);

        if (!isWin) {
            this._handleChombo(playerIndex, "錯榮和");
            return;
        }

        this.phase = "ROUND_END";
        console.log("榮和");
    }

    _handleRiichi(playerIndex) {
        const player = this.players[playerIndex];
        player.isReach = true;
        player.riichiWaitSet = this.logic.getWaitTiles(player.tepai);
    }

    _handleAnkan(playerIndex, tile) {
        // 暫留：之後補「不破壞聽牌」
        console.log("暗槓");
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

        this.lastDiscard = { tile, fromPlayer: playerIndex };
        this.phase = "OPPONENT_RESPONSE";
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
        this.phase = "PLAYER_DECISION";
    }

    _handleRyuukyoku() {
        this.phase = "ROUND_END";
        console.log("流局");
        // 這裡之後檢查詐立直
    }

    _handleChombo(playerIndex, reason) {
        this.phase = "ROUND_END";
        console.warn(`チョンボ：${reason}`);
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
