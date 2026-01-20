import {
    Deck
}
from "./core/deck.js";
import {
    getAvailableActions
}
from "./core/actionCheck.js";
import {
    calculateResult
}
from "./core/winCheck.js";

export class Game {
    constructor(onStateChange) {
        this.onStateChange = onStateChange || (() = >{});
        this.deck = null;
        this.players = [];
        this.turnIndex = 0;
        this.phase = 'INIT';
        this.incomingTile = null; // 暫存剛摸到的牌
        this.lastDiscard = null;
        this.winner = null;
    }

    start() {
        this.deck = new Deck();
        this.deck.shuffle();
        this.players = [this.createPlayer(0), this.createPlayer(1)];
        this.dealHands();

        // 莊家開始
        this.turnIndex = 0;
        this.processDraw();
    }

    createPlayer(index) {
        return {
            index,
            score: 25000,
            hand: [],
            melds: [],
            discards: [],
            isRiichi: false,
            isDoubleRiichi: false,
            isIppatsu: false,
            firstTurn: true
        };
    }

    dealHands() {
        for (let i = 0; i < 13; i++) {
            this.players[0].hand.push(this.deck.draw());
            this.players[1].hand.push(this.deck.draw());
        }
        this.sortHands();
    }

    sortHands() {
        this.players[0].hand.sort((a, b) = >a - b);
        this.players[1].hand.sort((a, b) = >a - b);
    }

    // === 摸牌 ===
    processDraw(isRinshan = false) {
        const player = this.players[this.turnIndex];

        if (this.deck.tiles.length === 0) {
            this.endGame(null, "流局");
            return;
        }

        // 摸牌存入暫存區
        this.incomingTile = this.deck.draw();
        this.phase = 'DRAW';

        const isPlayerTurn = (this.turnIndex === 0);

        // 新 actionCheck 回傳 { buttons, kanTiles }
        const {
            buttons,
            kanTiles
        } = getAvailableActions(player, isPlayerTurn, this.incomingTile, 'DRAW');

        if (isPlayerTurn) {
            // 玩家回合：照規則顯示 TSUMO/RIICHI/KAN/CANCEL
            this.notifyUI(buttons, 0, {
                kanTiles
            });
        } else {
            // 電腦回合：不顯示任何按鈕（對手回合隱藏）
            this.notifyUI([], 1, {
                kanTiles: []
            });

            // 電腦自動出牌（最簡單：摸切）
            this.aiAutoDiscard();
        }
    }

    // === 切牌 ===
    playerDiscard(discardInput, isRiichiDeclaration = false) {
        const player = this.players[this.turnIndex];

        const discardTile = (typeof discardInput === 'object') ? discardInput.tile: discardInput;
        const from = (typeof discardInput === 'object') ? discardInput.from: null;
        const handIndex = (typeof discardInput === 'object') ? discardInput.index: null;

        if (isRiichiDeclaration) {
            player.isRiichi = true;
            if (player.firstTurn && player.melds.length === 0) player.isDoubleRiichi = true;
            player.isIppatsu = true;
        } else {
            if (player.isIppatsu) player.isIppatsu = false;
        }

        // === 依來源丟牌，避免數字相同誤判 ===
        if (from === 'INCOMING') {
            // 丟剛摸到的
            this.incomingTile = null;
        } else {
            // 丟手牌（優先用 index，避免重複牌時不準）
            let idx = -1;
            if (Number.isInteger(handIndex) && player.hand[handIndex] === discardTile) idx = handIndex;
            else idx = player.hand.indexOf(discardTile);

            if (idx === -1) return;

            player.hand.splice(idx, 1);

            // 把摸到的那張補進手牌
            if (this.incomingTile !== null) {
                player.hand.push(this.incomingTile);
                this.incomingTile = null;
                player.hand.sort((a, b) = >a - b);
            }
        }

        player.discards.push(discardTile);
        this.lastDiscard = {
            tile: discardTile,
            from: this.turnIndex
        };
        player.firstTurn = false;

        // 消除對手一發
        this.players[(this.turnIndex + 1) % 2].isIppatsu = false;

        this.checkOpponentRon(discardTile);
    }

    checkOpponentRon(tile) {
        this.phase = 'DISCARD';

        // opponentIdx = 可能榮和的人（玩家）
        const opponentIdx = (this.turnIndex + 1) % 2;
        const opponent = this.players[opponentIdx];

        // 新 actionCheck 回傳 { buttons, kanTiles }
        const {
            buttons
        } = getAvailableActions(opponent, false, tile, 'DISCARD');

        // 不管能不能和，你規則都要顯示 RON + CANCEL 給玩家自己決定
        // 所以永遠切回玩家視角（playerIndex=0）等待按鈕
        this.notifyUI(buttons, 0, {
            kanTiles: []
        });

        // 重要：這裡不要 nextTurn()，要等玩家按 CANCEL -> PASS 才換巡
    }

    aiAutoDiscard() {
        // 最簡單 AI：摸切（丟剛摸到的那張）
        if (this.incomingTile == null) return;

        this.playerDiscard({
            tile: this.incomingTile,
            from: 'INCOMING'
        });
    }

    playerAction(actionType, data) {
        const player = this.players[this.turnIndex];

        if (actionType === 'PASS') {
            this.nextTurn();
            return;
        }

        if (actionType === 'TSUMO') {
            this.handleWin(this.turnIndex, data.winTile, true);
        } else if (actionType === 'RON') {
            // data.playerIndex 是按按鈕的人
            this.handleWin(data.playerIndex, this.lastDiscard.tile, false);
        } else if (actionType === 'KAN') {
            this.handleAnkan(player, data.kanTile);
        }
    }

    handleAnkan(player, tileVal) {
        // 從手牌移除 4 張
        // 注意：有可能 3 張在 hand, 1 張是 incoming
        // 或者 4 張都在 hand (如果剛好摸進來已經合併? 不，我們現在分開存)
        let removeCount = 0;

        // 先看 incoming
        if (this.incomingTile === tileVal) {
            this.incomingTile = null;
            removeCount++;
        }

        // 再看 hand
        // 我們需要從後面往前刪，以免 index 跑掉
        for (let i = player.hand.length - 1; i >= 0; i--) {
            if (player.hand[i] === tileVal && removeCount < 4) {
                player.hand.splice(i, 1);
                removeCount++;
            }
        }

        player.melds.push({
            type: 'ankan',
            tiles: [tileVal, tileVal, tileVal, tileVal]
        });

        // 嶺上補牌
        this.processDraw(true);
    }

    handleWin(winnerIndex, winTile, isTsumo) {
        const winner = this.players[winnerIndex];

        // handTiles 必須是不含 winTile 的手牌（13 張）
        const handTiles = [...winner.hand];

        // Tenhou（天和）判定：簡化版——莊家首巡自摸，且未有人打出任何牌
        const isTenhou = isTsumo && winnerIndex === 0 && winner.firstTurn === true && (this.players[0].discards.length === 0) && (this.players[1].discards.length === 0) && (winner.melds.length === 0);

        const ctx = {
            isTsumo,
            isTenhou,
            isRiichi: winner.isRiichi,
            isDoubleRiichi: winner.isDoubleRiichi,
            isIppatsu: winner.isIppatsu,
            melds: winner.melds,
            dora: [],
            // 如果你之後要算嶺上開花等，可以在 processDraw(isRinshan) 補 ctx.isRinshan
        };

        const result = calculateResult(handTiles, winTile, ctx);

        // ✅ 如果 result 為 null：代表詐和 -> チョンボ
        if (!result) {
            this.applyChombo(winnerIndex);
            return;
        }

        this.winner = winnerIndex;
        this.endGame(result, isTsumo ? "Tsumo": "Ron");
    }

    applyChombo(offenderIndex) {
        const offender = this.players[offenderIndex];
        const opponentIndex = (offenderIndex + 1) % 2;
        const opponent = this.players[opponentIndex];

        // 規則：親 48000、子 32000（你目前莊家固定 0）
        const isDealer = (offenderIndex === 0);
        const penalty = isDealer ? 48000 : 32000;

        offender.score -= penalty;
        opponent.score += penalty;

        // 飛び（擊飛）就結束
        const reason = (offender.score < 0) ? "飛び": "チョンボ";
        this.winner = opponentIndex;

        this.endGame({
            isYakuman: true,
            yaku: [{
                name: "CHOMBO",
                han: 0
            }],
            han: 0,
            scoreName: reason,
            penalty
        },
        reason);
    }

    const result = calculateResult(fullHand, winTile, ctx);
    this.winner = winnerIndex;
    this.endGame(result, isTsumo ? "Tsumo": "Ron");
}

nextTurn() {
    // 如果有殘留的 incomingTile (例如對手榮和檢查完後 Pass)，要合併進手牌
    // 但理論上 checkOpponentRon 時，如果是 discard 觸發，incoming 早就處理完了
    // 只有在 nextTurn 是從自己切牌後觸發的才對。
    this.turnIndex = (this.turnIndex + 1) % 2;
    this.incomingTile = null; // 清空上一人的暫存
    this.processDraw();
}

endGame(result, reason) {
    this.phase = 'END';
    this.notifyUI([], -1, {
        result,
        reason,
        winnerIndex: this.winner
    });
}

// 統一通知介面
notifyUI(actions = [], activePlayerIdx = null, extraData = {}) {
    const idx = activePlayerIdx !== null ? activePlayerIdx: this.turnIndex;

    const state = {
        type: this.phase === 'END' ? 'GAME_OVER': this.phase,
        playerIndex: idx,
        // 誰正在操作
        incomingTile: this.incomingTile,
        // 全局的 incoming
        // 傳送完整玩家資料
        p0: this.players[0],
        p1: this.players[1],

        actions: actions,
        ...extraData
    };

    this.onStateChange(state);
}
}
