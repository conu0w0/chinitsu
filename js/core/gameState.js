/**
 * gameState.js
 * 遊戲狀態管理器
 */

import { MahjongLogic } from './mahjongLogic.js';
import { decomposeHand, selectBestPattern, calculateFu } from "./yakuJudge.js";
import { Scoring } from "./scoring.js";
import { decideComAction } from '../ai/ai.js';

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
        this.isDoubleReach = false;
        this.ippatsuActive = false;
        this.ippatsuBroken = false;
        this.riichiWaitSet = null;
        this.riichiFuriten = false;
        this.isParent = false;
        this.isTenpai = false;
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
        // INIT | DEALING | DEAL_FLIP | DRAW 
        // PLAYER_DECISION (Root層) | ANKAN_SELECTION (槓層) | RIICHI_DECLARATION (立直層)
        // DISCARD_ONLY (只能切牌)
        // REACTION_DECISION (回應層) | ROUND_END
        this.phase = "INIT";

        this.dealState = { round: 0, currentPlayer: 0, tilesLeftInBatch: 0 };
        this.lastDiscard = null;
        this.lastResult = null;
        this.roundContext = {};
        this.actionContext = {};

        this._resetRoundContext();
        this._resetActionContext();
    }

    /**
     * 終極堆牌術：同時控制 玩家, COM, 和 牌山順序
     */
    _createRiggedYama(pHand, cHand, nextDraws) {
        console.log("啟動碼牌模式...");

        // 1. 建立完整的牌庫 (36張)
        let pool = [];
        for (let t = 0; t <= 8; t++) {
            for (let i = 0; i < 4; i++) pool.push(t);
        }

        // 輔助函式：從 pool 裡面安全移除牌
        const takeFromPool = (tiles) => {
            const result = [];
            for (let t of tiles) {
                const idx = pool.indexOf(t);
                if (idx !== -1) {
                    pool.splice(idx, 1);
                    result.push(t);
                } else {
                    console.warn(`⚠️ 牌不夠用了！無法提供: ${t+1}s，改用隨機牌代替`);
                    // 如果指定的牌沒了，就從剩下的 pool 隨便拿一張補，避免當機
                    if (pool.length > 0) {
                        const randomIdx = Math.floor(Math.random() * pool.length);
                        result.push(pool.splice(randomIdx, 1)[0]);
                    }
                }
            }
            return result;
        };

        // 2. 鎖定並扣除玩家指定的牌 (如果有的話)
        let finalPHand = [];
        if (pHand && pHand.length === 13) {
            finalPHand = takeFromPool(pHand);
        } else {
            // 沒指定或長度不對，就隨機抽
            for(let i=0; i<13; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                finalPHand.push(pool.splice(idx, 1)[0]);
            }
        }

        // 3. 鎖定並扣除 COM 指定的牌
        let finalCHand = [];
        if (cHand && cHand.length === 13) {
            finalCHand = takeFromPool(cHand);
        } else {
            // 沒指定就隨機抽
             for(let i=0; i<13; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                finalCHand.push(pool.splice(idx, 1)[0]);
            }
        }

        // 4. 鎖定接下來要摸的牌 (nextDraws)
        let finalNextDraws = [];
        if (nextDraws && nextDraws.length > 0) {
            finalNextDraws = takeFromPool(nextDraws);
        }

        // 5. 剩下的牌洗亂，當作未來的未知牌山
        this._shuffle(pool);

        // 6. === 開始組裝 Yama ===
        // 結構：[洗亂的剩餘牌] + [摸牌預定區(反轉)] + [發牌區(交錯)] -> 尾端(Pop端)

        // A. 處理摸牌預定區 (Next Draws)
        // 因為 pop() 是從後面拿，所以要先把 nextDraws「反轉」後 push 進去
        // 這樣 pop() 第一次才會拿到 nextDraws 的第一張
        // 但是要注意：pool 是放在最底部的。
        
        // 目前 stack: [ ...pool ]
        
        // 我們要讓 nextDraws 接在發牌結束後的「最上面」。
        // 所以順序是：
        // Bottom -> [Pool] -> [NextDraws Reverse] -> [StartHands Reverse Interleave] -> Top
        
        let constructedYama = [...pool];
        
        // 放入預定摸牌 (反轉，因為 pop 是從尾巴拿)
        // 舉例：nextDraws = [1, 2]。想要先摸 1。
        // yama 應該是 [..., 2, 1]。pop() -> 1, pop() -> 2。
        if (finalNextDraws.length > 0) {
             // 複製一份並反轉
             const reversedDraws = [...finalNextDraws].reverse();
             constructedYama.push(...reversedDraws);
        }

        // B. 處理起手配牌 (倒序模擬)
        // 配牌順序：
        // Round 1: P(4) -> C(4)
        // ...
        // Round 4: P(1) -> C(1)
        
        // 為了讓 pop() 正確，Yama 尾端必須是：
        // [..., R1_C, R1_P] (最尾巴)
        
        const pBatches = [
            finalPHand.slice(0, 4),
            finalPHand.slice(4, 8),
            finalPHand.slice(8, 12),
            finalPHand.slice(12, 13)
        ];
        const cBatches = [
            finalCHand.slice(0, 4),
            finalCHand.slice(4, 8),
            finalCHand.slice(8, 12),
            finalCHand.slice(12, 13)
        ];

        // 倒著塞入 (從 Round 4 到 Round 1)
        for (let i = 3; i >= 0; i--) {
            // 先塞 COM (因為它比玩家晚摸，所以在 Array 中要比較裡面/前面)
            constructedYama.push(...cBatches[i]);
            // 再塞 Player (最晚塞入 = 最早被 Pop)
            constructedYama.push(...pBatches[i]);
        }

        this.yama = constructedYama;
        console.log("碼牌完成！牌山長度:", this.yama.length);
    }

    /* ======================
       初始化一局
       ====================== */
    startGame() {
       console.log("=== 遊戲開始 ===");
       
       this.parentIndex = Math.floor(Math.random() * 2);
       console.log(`起莊決定：${this.parentIndex === 0 ? "玩家" : "COM"}`);
       
       this._initKyokuInternal();
    }

    _initKyokuInternal() {
        this.lastResult = null;
       
        this._resetRoundContext();
        this._resetActionContext();

        this.players.forEach((p, i) => {
            p.resetHand();
            p.isParent = (i === this.parentIndex);
        });

        // 建立牌山：索子 1s~9s 各 4 張 (共 36 張)
        const cheat = window.TEST_CONFIG;
       
        if (cheat && cheat.enabled) {
            this._createRiggedYama(cheat.playerHand, cheat.comHand, cheat.nextDraws);
        } else {
            // 正常隨機
            this.yama = [];
            for (let tile = 0; tile <= 8; tile++) {
                for (let i = 0; i < 4; i++) this.yama.push(tile);
            }
            this._shuffle(this.yama);
        }

        // 1. 發牌 (13張)
        this.phase = "DEALING";
        this.dealState = {
            round: 0,
            currentPlayer: this.parentIndex,
            tilesLeftInBatch: 4
        };

        this.players.forEach(p => {
           p.tepai = [];
           p.handFaceDown = false; // 發牌時是正面
        });
        const parentName = (this.parentIndex === 0) ? "玩家" : "COM";
        console.log(`=== 配牌開始 (親: ${parentName}) ===`);
        setTimeout(() => {
            this._autoDeal();
        }, 400); 
    }

    nextKyoku() {
       if (!this.lastResult) {      
          this._initKyokuInternal();
          return;
       }
       
       const result = this.lastResult;
       let shouldRotate = false;
       
       // 1. 胡牌 (Ron / Tsumo)
       if (result.type === "win") {
          shouldRotate = (result.winnerIndex !== this.parentIndex);
          console.log(shouldRotate ? "子家胡牌 -> 輪莊" : "親家胡牌 -> 連莊");
       }
       // 2. 流局 (Ryuukyoku)
       else if (result.type === "ryuukyoku") {
          const parentPlayer = this.players[this.parentIndex];
          shouldRotate = !parentPlayer.isTenpai;
          console.log(parentPlayer.isTenpai ? "親家聽牌 -> 連莊" : "親家不聽 -> 輪莊");
       }
       // 3. 犯規 (Chombo)
       else if (result.type === "chombo") {
          shouldRotate = (result.offenderIndex === this.parentIndex);
          console.log(shouldRotate ? "親家犯規 -> 輪莊" : "子家犯規 -> 連莊");
       }
       // 執行輪莊
       if (shouldRotate) { this.parentIndex = (this.parentIndex + 1) % 2 };

       // 開始新的一局
      this._initKyokuInternal();
    }
   
    // 新增在 GameState 類別裡
    _autoDeal() {
        // 如果狀態不是 DEALING，就停止 (代表發完了)
        if (this.phase !== "DEALING") return;

        // 發牌
        this.dealBatch();

        // 設定間隔 (例如 50ms 發一張)，遞迴呼叫自己
        setTimeout(() => {
            this._autoDeal();
        }, 400); 
    }

    dealBatch() {
       if (this.phase !== "DEALING") return;
       
       // 防呆：如果牌山沒了，直接強制結束
       if (this.yama.length === 0) {
           this.finishDealing();
           return;
       }

       const ds = this.dealState;
       const player = this.players[ds.currentPlayer];
       const count = ds.tilesLeftInBatch;
       
       const newTiles = [];
       for (let i = 0; i < count; i++) {
           if (this.yama.length > 0) {
               const tile = this.yama.pop();
               player.tepai.push(tile);
               newTiles.push(tile);
           }
       }

       // 通知 Renderer (動畫用)
       this.lastAction = {
          type: "deal_batch",
          player: ds.currentPlayer,
          tiles: newTiles
       };

       ds.tilesLeftInBatch = 0;
       const nextPlayer = (ds.currentPlayer + 1) % 2;
       
       if (ds.currentPlayer !== this.parentIndex) {
           ds.round++;
       }

       ds.currentPlayer = nextPlayer;

       if (ds.round < 3) {
           ds.tilesLeftInBatch = 4; // 前三輪抓 4 張
       } else if (ds.round === 3) {
           ds.tilesLeftInBatch = 1; // 最後一輪抓 1 張
       } else {
           this.finishDealing();
           return; 
       }
    }

    finishDealing() {
       this.phase = "DEALING_WAIT";
       
       setTimeout(() => {
           this.phase = "DEAL_FLIP"; 
           this.players.forEach(p => p.handFaceDown = true);
           console.log("配牌完畢，自動理牌中...");
           setTimeout(() => this.startFirstTurn(), 800);
       }, 800); 
    }
      
    startFirstTurn() {
       console.log("開牌！親家摸牌");
       this.players.forEach(p => {
          p.handFaceDown = false;
          p.tepai.sort((a, b) => a - b); // 整理手牌
       });
       
       // 輪到莊家
       this.turn = this.parentIndex;
       
       // 莊家摸第 14 張 (真正的摸牌動畫)
       this.phase = "DRAW";
       this._draw(this.turn); 
       
       // 摸完後才進入決策階段
       this.phase = "PLAYER_DECISION";

       if (this.turn === 1) {
          setTimeout(() => this._handleComTurn(), 600);
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
        if (this.phase === "PLAYER_DECISION" && this.turn === playerIndex) {
            // 自摸判定
            actions.canTsumo = true;

            // 暗槓判定
            if (this.yama.length > 0) {
                const waitSet = player.isReach ? player.riichiWaitSet : null;
                actions.ankanTiles = this.logic.getAnkanTiles(player.tepai, this._getAnkanCount(player), waitSet);
                actions.canAnkan = (actions.ankanTiles.length > 0);
            }

            // 立直判定 (未立直)
            if (!player.isReach) {
                actions.canRiichi = true;
            }

            // 在 Root 層，Cancel 意味著「跳過所有特殊動作，去切牌」
            actions.canCancel = true;
        }

        // === 2. 對手打牌後的決策 (榮和) ===
        if (this.phase === "REACTION_DECISION" && this.lastDiscard) {
            actions.canRon = (this.lastDiscard.fromPlayer !== playerIndex);
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

                    if (type === "ANKAN") {
                        this._handleAnkan(playerIndex, action.tile);
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
                        // 註：此時未正式立直，等待切牌確認
                        return;
                    }

                    // 取消 -> 鎖定為只能切牌
                    if (type === "CANCEL") {
                        // 立直狀態：自動摸切
                        if (player.isReach) {
                            const drawnTileIndex = player.tepai.length - 1;
                            this.playerDiscard(playerIndex, drawnTileIndex);
                        } else {
                            // 非立直狀態：鎖定為只能切牌 (隱藏按鈕，讓玩家自己選牌切出)
                            this.phase = "DISCARD_ONLY";
                        }
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

        // 1. 檢查：如果是在立直宣言狀態下切牌，則確認立直
        let DeclarationDiscard = false;

        if (this.phase === "RIICHI_DECLARATION") {
            isRiichiDeclarationDiscard = true;
            this.phase = "PLAYER_DECISION";

            // 執行立直扣點與標記 (先標記 actionContext，出牌後才正式生效)
            this._handleRiichi(playerIndex);
        }

        // 2. 立直後限制：只能切剛摸到的牌
        if (player.isReach && !isRiichiDeclarationDiscard) {
            const isTsumoTile = (tileIndex === player.tepai.length - 1);
            if (!isTsumoTile) {
                console.warn("立直後只能切摸牌");
                return; 
            }
        }

        // === 3. 執行切牌 ===
        const tile = player.tepai.splice(tileIndex, 1)[0];
        player.tepai.sort((a, b) => a - b);

        // 這是給 UI 畫牌河用的 (標記這張牌要橫著擺)
        player.river.push({
            tile,
            isRiichi: isRiichiDeclarationDiscard 
        });

        // 4. 一發狀態處理
        if (player.isReach && player.ippatsuActive && !isRiichiDeclarationDiscard) { player.ippatsuActive = false };

        // 5. 清理與重置上下文
        this.actionContext.isKanburiCandidate = this.actionContext.lastActionWasKan;
        this.actionContext.lastActionWasKan = false;
        this.actionContext.isAfterKan = false;

        // 6. 設定最後打出的牌
        this.lastDiscard = {
            tile,
            fromPlayer: playerIndex,
            isRiichiDeclaration: this.actionContext.pendingRiichi 
        };

        this.phase = "REACTION_DECISION";
        console.log(`玩家切牌: ${tile + 1}s` + (this.actionContext.pendingRiichi ? " (立直宣言)" : ""));

        // === 觸發 COM 回應 ===
        if (playerIndex === 0) {
            setTimeout(() => {
                this._handleComResponse();
            }, 500);
        }
    }
   
   _finalizePendingRiichi() {
       if (this.actionContext.pendingRiichiPlayer !== null) {
           const pIndex = this.actionContext.pendingRiichiPlayer;
           const p = this.players[pIndex];

           p.isReach = true;
           
           // ★ 從 actionContext 讀取這次立直是不是兩立直
           if (this.actionContext.pendingDoubleRiichi) {
               p.isDoubleReach = true;
           }

           p.riichiWaitSet = this.logic.getWaitTiles(p.tepai);
           console.log(p.isDoubleReach ? "兩立直成立！" : "立直成立");
          
           p.ippatsuActive = true;
           p.ippatsuBroken = false;

           // 清理狀態
           this.actionContext.pendingRiichi = false;
           this.actionContext.pendingDoubleRiichi = false;
           this.actionContext.pendingRiichiPlayer = null;   
       }
   }

   _breakAllIppatsu() {
      this.players.forEach(p => {
         if (p.ippatsuActive) {
            p.ippatsuActive = false;
            p.ippatsuBroken = true;
         }
      });
   }

   
    // 回合推進
    _advanceAfterResponse() {
        this._finalizePendingRiichi();
       
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

        const savedAfterKan = this.actionContext.isAfterKan;
        this._resetActionContext();
        if (savedAfterKan) this.actionContext.isAfterKan = true; // 嶺上

        this.phase = "PLAYER_DECISION";
        console.log(`${player.name} 摸牌: ${playerIndex === 0 ? `${tile + 1}s` : '??'}`);
    }

    /* ======================
       動作處理 (Internal)
       ====================== */

    _handleRiichi(playerIndex) {
        this.actionContext.pendingRiichi = true;
        this.actionContext.pendingRiichiPlayer = playerIndex;
       
        const player = this.players[playerIndex];
        const yamaLeft = this.yama.length;
        
        // 確保沒人鳴牌
        const noCalls = this.players.every(p => p.fulu.length === 0);

        // 判斷是否符合「親家9張」或「子家8張」
        const isFirstTurn = (player.isParent && yamaLeft === 9) || 
                            (!player.isParent && yamaLeft === 8);

        this.actionContext.pendingDoubleRiichi = noCalls && isFirstTurn;
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
       
        this._breakAllIppatsu();
        player.tepai.sort((a, b) => a - b);

        this.actionContext.isAfterKan = true;
        this.actionContext.lastActionWasKan = true;

        const who = (playerIndex === 0) ? "玩家" : "COM";
        console.log(`${who} 暗槓 ${tile + 1}s`);

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

        // 這是「榮和階段」的 Cancel
        if (this.phase === "REACTION_DECISION") {

            // 處理立直振聽
            if (player.isReach && player.riichiWaitSet && player.riichiWaitSet.has(this.lastDiscard.tile)) {
                player.riichiFuriten = true;
                console.log("立直振聽");
            }

            console.log("選擇 Skip (不榮和)");
            this._advanceAfterResponse();
        }
    }

    /* ======================
       COM 邏輯
       ====================== */
   _handleComTurn() {
        // 1. 取得 AI 的決策
        const action = decideComAction(this, 1);

        if (action.type === 'DISCARD') {
            // 一般切牌
            this.playerDiscard(1, action.tileIndex);
        } else {
            // 2. 執行特殊動作 (RIICHI, ANKAN 等)
            this.applyAction(1, action);

            if (this.phase === 'RIICHI_DECLARATION') {
                const discardAction = decideComAction(this, 1);
                
                if (discardAction.type === 'DISCARD') {
                    console.log(`🤖 COM 立直後切牌: ${ discardAction.tileIndex + 1 }s`);
                    
                    // 加一點點延遲，讓「立直」的動畫或音效先跑出來，再切牌
                    setTimeout(() => {
                        this.playerDiscard(1, discardAction.tileIndex);
                    }, 500);
                }
            }

            else if (this.phase === 'PLAYER_DECISION' && this.turn === 1) {
                console.log("🤖 COM 暗槓後再次思考...");
                setTimeout(() => {
                    this._handleComTurn(); // 遞迴呼叫自己，處理下一手
                }, 500);
            }
        }
    }

   _handleComResponse() {
      const action = decideComAction(this, 1);
      this.applyAction(1, action);
   }

    /* ======================
       Helpers & Utility
       ====================== */

    _handleRyuukyoku() {
        this.phase = "ROUND_END";
        this.lastResult = { type: "ryuukyoku" };
        console.log("=== 流局 ===");

        // 1. 判定所有玩家是否聽牌
        const tenpaiInfo = [];
        this.players.forEach((p, idx) => {
            // 檢查是否聽牌：如果現在切掉任何一張牌(或是不切)能聽，就算聽牌
            // 由於流局時手牌是滿的(13張或14張)，我們直接檢查 getWaitTiles
            // 注意：這裡簡化，直接檢查現有手牌是否為聽牌形
            const waits = this.logic.getWaitTiles(p.tepai);
            p.isTenpai = (waits.size > 0);
            
            tenpaiInfo.push({
                index: idx,
                isTenpai: p.isTenpai,
                hand: p.tepai
            });
        });

        this.lastResult = { 
            type: "ryuukyoku",
            tenpaiInfo: tenpaiInfo
        };
       
        this.phase = "ROUND_END";
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
        const otherIndex = (playerIndex + 1) % 2;
        const other = this.players[otherIndex];
       
        const base = 32000;
        const multiplier = offender.isParent ? 1.5 : 1;
        const penalty = base * multiplier;
       
        offender.points -= penalty;
        other.points += penalty;

        this.lastResult = {
            type: "chombo",
            offenderIndex: playerIndex,
            isParent: offender.isParent,
            score: {
                display: `犯規：${reason}`,
                total: penalty
            }
        };
        console.warn(`(${offender.isParent ? "親" : "子"}) 犯規：${reason}`);
        this.phase = "ROUND_END";
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

        const winner = this.players[playerIndex];
        const loserIndex = (playerIndex + 1) % 2;
        const loser = this.players[loserIndex];

        const scoring = new Scoring();
        const score = scoring.scoreHand({
            han: best.han,
            fu,
            yakus: best.yakus,
            yakumanRank: best.yakumanRank,
            isKazoeYakuman: best.isKazoeYakuman,
            isParent: ctx.isParent
        });

        const pts = score.score;

        // 點數移動
        winner.points += pts;
        loser.points -= pts;

        this.lastResult = {
            type: "win",
            winnerIndex: playerIndex,
            best,
            fu,
            score: {
                ...score,
                total: score.score
            },
            winType: ctx.winType,
            isParent: ctx.isParent 
        };
       
        this.phase = "ROUND_END";
    }

    _resetActionContext() {
        this.actionContext = {
            isAfterKan: false,
            lastActionWasKan: false,
            pendingRiichi: false,
            pendingDoubleRiichi: false,
            pendingRiichiPlayer: null,
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
            haitei: false,
            houtei: false
        };
    }

    _buildWinContext(playerIndex, winType, winTile) {
        const player = this.players[playerIndex];
        const waits = player.isReach ? player.riichiWaitSet : this.logic.getWaitTiles(player.tepai);
        const isTenhou = this.roundContext.tenhou === true;

        return {
            winType,
            winTile,
            isTenhou,
            tiles: winType === "tsumo" ? [...player.tepai] : [...player.tepai, winTile],
            ...this.roundContext,
            waits,
            ippatsu: (player.ippatsuActive && !player.ippatsuBroken),
            tsubame: (winType === 'ron' && this.lastDiscard && this.lastDiscard.isRiichiDeclaration),
            rinshan: this.actionContext.isAfterKan,
            kanburi: (winType === 'ron' && this.actionContext.isKanburiCandidate),
            riichi: player.isReach,
            doubleRiichi: player.isDoubleReach,
            isParent: player.isParent,
        };
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
