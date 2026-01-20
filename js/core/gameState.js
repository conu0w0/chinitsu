/**
 * GameState.js
 * 遊戲狀態管理器：負責牌堆管理、回合輪替、玩家行為決策與狀態追蹤。
 */

import { MahjongLogic } from './mahjongLogic.js';

export class Player {
    constructor(id, name, isCom = true) {
        this.id = id;
        this.name = name;
        this.isCom = isCom;
        this.points = 25000; // 初始點數
        this.resetHand();
    }

    resetHand() {
        this.tepai = [];      // 手牌
        this.fulu = [];       // 副露 (吃、碰、槓的牌)
        this.river = [];      // 牌河 (打出的牌)
        this.isReach = false; // 是否立直
        this.isParent = false;// 是否為莊家
    }
}

export class GameState {
    constructor() {
        this.logic = new MahjongLogic();
        this.players = [
            new Player(0, "玩家 (你)", false),
            new Player(1, "下家 (COM)"),
            new Player(2, "對家 (COM)"),
            new Player(3, "上家 (COM)")
        ];
        
        this.yama = [];       // 牌山 (Deck)
        this.doraIndicator = []; // 寶牌指示牌
        this.turn = 0;        // 當前輪到的玩家索引 (0-3)
        this.bakaze = 27;     // 場風 (預設東風: 27)
        this.honba = 0;       // 本場數
    }

    /**
     * 初始化新的一局 (洗牌與發牌)
     */
    initKyoku(bakaze, parentIndex) {
        this.bakaze = bakaze;
        this.players.forEach((p, i) => {
            p.resetHand();
            p.isParent = (i === parentIndex);
        });

        // 1. 建立牌山 (34種牌各4張)
        this.yama = [];
        for (let i = 0; i < 34; i++) {
            for (let j = 0; j < 4; j++) this.yama.push(i);
        }
        this._shuffle(this.yama);

        // 2. 配牌 (每人13張)
        for (let i = 0; i < 13; i++) {
            for (let p = 0; p < 4; p++) {
                this.players[p].tepai.push(this.yama.pop());
            }
        }

        // 3. 排序手牌
        this.players.forEach(p => p.tepai.sort((a, b) => a - b));
        
        this.turn = parentIndex; // 從莊家開始
        console.log(`第 ${this.honba} 本場 開始，莊家為玩家 ${parentIndex}`);
    }

    /**
     * 玩家摸牌
     */
    playerDraw(playerIndex) {
        if (this.yama.length <= 14) {
            this.handleRyuuku(); // 荒牌流局
            return;
        }
        const tile = this.yama.pop();
        this.players[playerIndex].tepai.push(tile);
        return tile;
    }

    /**
     * 玩家打牌
     */
    playerDiscard(playerIndex, tileIndex) {
        const player = this.players[playerIndex];
        const tile = player.tepai.splice(tileIndex, 1)[0];
        player.river.push(tile);
        player.tepai.sort((a, b) => a - b);

        // 打牌後，檢查其他玩家是否可以榮和或吃碰槓
        if (!this.checkInterruption(playerIndex, tile)) {
            this.nextTurn();
        }
    }

    /**
     * 切換至下一位玩家
     */
    nextTurn() {
        this.turn = (this.turn + 1) % 4;
        this.playerDraw(this.turn);
    }

    /**
     * 檢查是否有人鳴牌或榮和 (簡單邏輯)
     */
    checkInterruption(discarderIndex, tile) {
        // 這裡會調用 MahjongLogic 檢查其他三家
        // 如果有人要胡或碰，則返回 true 並暫停輪替
        return false; 
    }

    handleRyuuku() {
        console.log("流局");
        // 處理聽牌賠付邏輯
    }

    // --- 工具函式 ---
    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
