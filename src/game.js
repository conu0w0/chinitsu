import { Deck } from "./core/deck.js";
import { getAvailableActions } from "./core/actionCheck.js";
import { calculateResult } from "./core/winCheck.js";
import { GAME_CONFIG } from "./core/constants.js"; // 假設常數存在這裡，或直接寫死

export class Game {
    /**
     * @param {Function} onStateChange - 當遊戲狀態改變時的回呼函數 (通知 UI 更新)
     */
    constructor(onStateChange) {
        this.onStateChange = onStateChange || (() => {});
        this.deck = null;
        this.players = [];
        this.turnIndex = 0; // 0: 親家, 1: 子家
        this.phase = 'INIT'; // INIT, DRAW, DISCARD, END
        this.lastDiscard = null; // 上一張被打出的牌 { tile: number, from: index }
        this.winner = null;
    }

    // === 遊戲初始化 ===

    start() {
        console.log("=== Game Started (Chinitsu Battle) ===");
        
        // 1. 初始化牌山
        this.deck = new Deck();
        this.deck.shuffle();

        // 2. 初始化玩家
        this.players = [
            this.createPlayer(0), // 莊家
            this.createPlayer(1)  // 子家
        ];

        // 3. 配牌
        this.dealHands();

        // 4. 莊家開始 (模擬莊家摸第14張牌)
        this.turnIndex = 0;
        this.processDraw(); 
    }

    createPlayer(index) {
        return {
            index: index,
            score: 150000, // 起始 15萬點
            hand: [],      // 手牌 (數字陣列)
            melds: [],     // 副露/暗槓
            discards: [],  // 舍牌區
            isRiichi: false,
            isDoubleRiichi: false, // 判斷雙立直用
            isIppatsu: false,      // 一發狀態
            firstTurn: true        // 用於判斷天和/地和/雙立直
        };
    }

    dealHands() {
        // 每人發 13 張
        for (let i = 0; i < 13; i++) {
            this.players[0].hand.push(this.deck.draw());
            this.players[1].hand.push(this.deck.draw());
        }
        // 理牌
        this.players[0].hand.sort((a, b) => a - b);
        this.players[1].hand.sort((a, b) => a - b);
    }

    // === 核心流程：摸牌階段 ===

    processDraw(isRinshan = false) {
        const player = this.players[this.turnIndex];

        // 1. 檢查流局 (牌山剩餘 0 張)
        if (this.deck.tiles.length === 0) {
            this.endGame(null, "流局 (牌山耗盡)");
            return;
        }

        // 2. 摸牌
        const tile = this.deck.draw();
        // 為了 UI 顯示，我們暫時不把牌加入 hand 陣列，而是分開傳遞，直到玩家決定切牌
        // 但為了計算方便，有些邏輯需要先合併。這裡我們採取「incomingTile」模式。
        
        this.phase = 'DRAW';
        
        // 3. 檢查自摸/槓/立直 等動作
        const actions = getAvailableActions(
            player, 
            true, // isMyTurn
            tile, // incomingTile
            'DRAW'
        );

        // 4. 通知 UI 更新狀態 (顯示手牌 + 摸到的牌 + 可用按鈕)
        this.notifyUI({
            type: 'DRAW',
            playerIndex: this.turnIndex,
            incomingTile: tile,
            actions: actions
        });
    }

    // === 外部呼叫：玩家選擇切牌 ===
    
    /**
     * 玩家打出一張牌
     * @param {number} discardTile - 要打出的牌的值
     * @param {boolean} isRiichiDeclaration - 是否宣告立直
     */
    playerDiscard(discardTile, isRiichiDeclaration = false) {
        const player = this.players[this.turnIndex];
        
        // 1. 處理立直
        if (isRiichiDeclaration) {
            player.isRiichi = true;
            // 判斷是否雙立直 (第一巡且無副露 - 雖然本遊戲無吃碰，但有暗槓)
            if (player.firstTurn && player.melds.length === 0) {
                player.isDoubleRiichi = true;
            }
            // 處理一發標記 (開始)
            player.isIppatsu = true;
        } else {
            // 如果這回合沒和牌且切牌了，前一回合的一發狀態消失
            // 注意：這裡簡化處理，標準規則要在下家打牌或吃碰後消失，
            // 但因為是單挑且無鳴牌，對手回合就是下家，所以只要切牌，自己的一發權就沒了(如果上一輪立直)
            // 修正：自己立直後，要等到「下一次輪到自己摸牌前」都算一發。
            // 這裡的一發邏輯由 winCheck 的 ctx 處理，這裡只需標記 flag
        }

        // 2. 移除手牌中的該張牌
        // 注意：如果是剛摸到的牌，也要處理。
        // 我們假設 UI 層已經處理好「把摸到的牌放入手牌陣列」或者在這裡處理
        // 簡單做法：先嘗試從 hand 刪除，如果找不到(代表是摸到的那張)，就不動作(因為它還沒進 hand)
        // 但為了邏輯嚴謹，我們應該在 processDraw 後就把 tile 視為暫存，discard 時決定留誰
        
        // 實作：從 (hand + incoming) 裡面移除 discardTile，剩下的變回 hand
        // 為了簡化，假設外部傳進來的 discardTile 已經確保在手牌裡
        
        // 尋找並移除一張牌
        const idx = player.hand.indexOf(discardTile);
        if (idx > -1) {
            player.hand.splice(idx, 1);
        } else {
            // 可能是剛摸到的牌 (如果 UI 還沒把它合併進去)
            // 這裡需要根據你的 UI 實作調整。
            // 假設：processDraw 時牌還沒進 hand，playerDiscard 時我們會收到「最終手牌結構」
            // 這裡暫設：hand 已經包含剛摸到的牌
        }
        player.hand.sort((a, b) => a - b);

        // 3. 記錄舍牌
        player.discards.push(discardTile);
        this.lastDiscard = { tile: discardTile, from: this.turnIndex };
        
        // 4. 解除第一巡標記
        player.firstTurn = false;

        // 5. 解除對手的一發 (如果有) - 因為我打牌了，對手的一發機會結束
        const opponentIdx = (this.turnIndex + 1) % 2;
        this.players[opponentIdx].isIppatsu = false; 

        // 6. 進入對手檢查榮和階段
        this.checkOpponentRon(discardTile);
    }

    // === 核心流程：檢查對手榮和 ===

    checkOpponentRon(tile) {
        this.phase = 'DISCARD';
        const opponentIdx = (this.turnIndex + 1) % 2;
        const opponent = this.players[opponentIdx];

        // 1. 取得對手可用動作
        const actions = getAvailableActions(
            opponent,
            false, // Not my turn
            tile,  // Incoming (discarded by enemy)
            'DISCARD'
        );

        // 2. 如果對手能榮和
        if (actions.includes('RON')) {
            // 切換視角通知 UI，讓對手選擇是否榮和
            // 注意：這是單挑，如果不榮和就直接 Pass
            this.notifyUI({
                type: 'DISCARD_CHECK',
                playerIndex: opponentIdx,
                incomingTile: tile,
                actions: actions
            });
        } else {
            // 對手無動作，直接下一局
            this.nextTurn();
        }
    }

    // === 外部呼叫：玩家執行動作 (自摸, 榮和, 槓, Pass) ===

    playerAction(actionType, data) {
        const player = this.players[this.turnIndex]; // 當前操作者

        switch (actionType) {
            case 'TSUMO':
                this.handleWin(this.turnIndex, data.winTile, true);
                break;

            case 'RON':
                // 注意：榮和時操作者是對手 (相對於切牌者)
                // 這裡的 turnIndex 應該是指向「被詢問操作的人」
                // 為了避免混亂，我們在 UI 回調時應該傳入 playerIndex
                const actorIndex = data.playerIndex;
                this.handleWin(actorIndex, this.lastDiscard.tile, false);
                break;

            case 'KAN':
                // 暗槓
                this.handleAnkan(player, data.kanTile);
                break;
            
            case 'PASS':
                // 放棄榮和，遊戲繼續
                this.nextTurn();
                break;
        }
    }

    // === 處理和了 ===

    handleWin(winnerIndex, winTile, isTsumo) {
        const winner = this.players[winnerIndex];
        
        // 準備計算 Context
        const ctx = {
            isTsumo: isTsumo,
            isRiichi: winner.isRiichi,
            isDoubleRiichi: winner.isDoubleRiichi,
            isIppatsu: winner.isIppatsu,
            isTenhou: isTsumo && winner.firstTurn && winner.index === 0, // 親家第一巡自摸
            isChihou: isTsumo && winner.firstTurn && winner.index === 1, // 子家第一巡自摸
            isRenhou: !isTsumo && winner.firstTurn && winner.index === 1, // 子家第一巡榮和
            // 其他偶然役 (嶺上、海河底) 需追蹤 flag，這裡暫略
            ankanTiles: winner.melds.map(m => m.tiles)
        };

        const result = calculateResult(winner.hand, winTile, ctx);

        this.winner = winnerIndex;
        this.endGame(result, isTsumo ? "自摸" : "榮和");
    }

    // === 處理暗槓 ===

    handleAnkan(player, tileVal) {
        // 1. 從手牌移除 4 張
        const toRemove = [tileVal, tileVal, tileVal, tileVal];
        for (let t of toRemove) {
            const idx = player.hand.indexOf(t);
            if (idx > -1) player.hand.splice(idx, 1);
        }
        
        // 2. 加入 Melds
        player.melds.push({
            type: 'ankan',
            tiles: [tileVal, tileVal, tileVal, tileVal]
        });

        // 3. 嶺上開花 Flag (如果是下一張自摸胡的話) - 需在 Game 狀態加標記
        // 這裡簡化：補牌
        // 規則：嶺上牌直接從牌山摸 (無王牌區)
        
        // 摸牌並再次進入 processDraw (標記 isRinshan = true)
        // 實際上應該呼叫 processDraw，但要讓它知道這是槓後摸牌
        // 這裡我們直接呼叫 processDraw，邏輯是一樣的，只是需要讓 UI 知道這是補牌
        this.processDraw(true); 
    }

    // === 換人 ===

    nextTurn() {
        this.turnIndex = (this.turnIndex + 1) % 2;
        this.processDraw();
    }

    // === 遊戲結束 ===

    endGame(result, reason) {
        this.phase = 'END';
        
        let scoreDelta = 0;
        let winnerName = "";
        
        if (result) {
            // 計算點數 (這裡需要一個 pointCalculation.js，或者簡化版)
            // 假設 result 包含 han 和 fu，我們用簡單公式
            // 因為規則是「役滿罰符」制：
            // 若 Chonbo -> 罰滿貫
            // 若正常和牌 -> 計算點數
            // 這裡暫時只回傳結果給 UI 顯示
            winnerName = `Player ${this.winner}`;
        }

        this.notifyUI({
            type: 'GAME_OVER',
            reason: reason,
            result: result,
            winnerIndex: this.winner
        });
        
        console.log("Game Over:", reason, result);
    }

    // === 通知 UI ===
    notifyUI(data) {
        this.onStateChange(data);
    }
}
