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
        this.onStateChange = onStateChange || (() => {});
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
        this.players[0].hand.sort((a, b) => a - b);
        this.players[1].hand.sort((a, b) => a - b);
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
    const { buttons, kanTiles } = getAvailableActions(player, isPlayerTurn, this.incomingTile, 'DRAW');

    if (isPlayerTurn) {
        // 玩家回合：照規則顯示 TSUMO/RIICHI/KAN/CANCEL
        this.notifyUI(buttons, 0, { kanTiles });
    } else {
        // 電腦回合：不顯示任何按鈕（對手回合隱藏）
        this.notifyUI([], 1, { kanTiles: [] });

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
                player.hand.sort((a, b) => a - b);
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
    const { buttons } = getAvailableActions(opponent, false, tile, 'DISCARD');

    // 不管能不能和，你規則都要顯示 RON + CANCEL 給玩家自己決定
    // 所以永遠切回玩家視角（playerIndex=0）等待按鈕
    this.notifyUI(buttons, 0, { kanTiles: [] });

    // 重要：這裡不要 nextTurn()，要等玩家按 CANCEL -> PASS 才換巡
}


    aiAutoDiscard() {
    // 最簡單 AI：摸切（丟剛摸到的那張）
    if (this.incomingTile == null) return;

    this.playerDiscard({ tile: this.incomingTile, from: 'INCOMING' });
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

        // *** 關鍵修正：組合完整手牌用於計算 ***
        // calculateResult 需要 14 張牌 (或 13+1)
        // 如果是自摸，winTile 應該是 incomingTile (如果不為空)
        // 如果是榮和，winTile 是別人的舍牌
        // 複製一份手牌來計算
        const fullHand = [...winner.hand];
        // 如果手牌裡還沒包含這張贏的牌，把它加進去
        // 自摸時，如果是 incomingTile 贏，它現在還在 incomingTile 變數裡，不在 hand 裡
        if (isTsumo && this.incomingTile === winTile) {
            fullHand.push(winTile);
        } else if (!isTsumo) {
            // 榮和：把別人的舍牌加進來算
            fullHand.push(winTile);
        }

        // 如果剛好 incomingTile 存在但不是贏的牌 (例如暗槓後嶺上開花?)
        // 這裡簡化：確保 fullHand 數量正確 (應為 14 - melds*3)
        // 實際上 calculateResult 內部會處理 pattern，只要給它包含 winTile 的陣列即可
        const ctx = {
            isTsumo,
            isRiichi: winner.isRiichi,
            isDoubleRiichi: winner.isDoubleRiichi,
            isIppatsu: winner.isIppatsu,
            melds: winner.melds,
            // 傳入副露資訊
            dora: [] // 暫無寶牌
        };

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
