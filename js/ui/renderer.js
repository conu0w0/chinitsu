/**
 * renderer.js
 * 負責將 GameState 視覺化繪製到 Canvas 上
 * 包含：背景、手牌管理、動畫系統、UI 交互繪製
 */
import { ResultRenderer } from "./renderer/ResultRenderer.js";

export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;

        // === 1. 基礎配置 (Config) ===
        this.config = {
            width: 1024,
            height: 1024,
            fontFamily: "'M PLUS Rounded 1c', 'Microsoft JhengHei', sans-serif",
            tile: { w: 48, h: 76, gap: 2, drawGap: 20 },
            river: { w: 40, h: 56, gap: 2 },
            meld: { w: 36, h: 56 },
            colors: {
                text: "#ffffff",
                highlight: "#ffcc00",
                buttonBase: [74, 120, 90], // RGB
                buttonPressed: [30, 50, 40]
            }
        };

        // === 2. 佈局計算 (Layout) ===
        this._initLayout();

        // === 3. 狀態追蹤 (State Tracking) ===
        this.uiButtons = [];      // 存儲當前幀的按鈕區域
        this.animations = [];     // 存儲進行中的動畫
        this.hoveredIndex = -1;   // 滑鼠懸停的手牌 Index
        this.pressedButtonIndex = -1; // 滑鼠按下的按鈕 Index
        this._lastMarkedPaws = null;

        // 手牌動畫狀態
        this.handPhysics = {
            player: { currentXs: [] },
            com: { currentXs: [] }
        };

        this.handState = {
            lastLen0: 0,
            lastLen1: 0,
            lastMeld0: 0,
            lastMeld1: 0,
            yOffsets: new Array(14).fill(0),
            lastTepai: [[], []] 
        };

        // 分數跳動狀態
        this.scoreState = {
            visual: [150000, 150000],      // 當前顯示的分數 (動畫用)
            display: [0, 0],               // 最終渲染整數
            lastTargets: [150000, 150000], // 用來偵測分數是否發生變化
            animStartTime: 0               // 動畫允許開始的時間 (用於停頓)
        };

        this.viewport = {
            cssSize: 1024,
            dpr: 1,
            baseSize: 1024,
            scale: 1
            };


        // 子渲染器
        this.resultRenderer = new ResultRenderer(this);
    }

    setViewport({ cssSize, dpr, baseSize }) {
        this.viewport.cssSize = cssSize;
        this.viewport.dpr = dpr;
        this.viewport.baseSize = baseSize;

        // 世界(1024) -> device pixels 的縮放
        this.viewport.scale = (cssSize / baseSize) * dpr;
        }


    /**
     * 初始化佈局座標
     * 集中管理所有物件的 x, y 座標計算
     */
    _initLayout() {
        const { width: W, height: H } = this.config;
        const CX = W / 2;
        const CY = H / 2;
        const { w: rW, h: rH, gap: rGap = 0 } = this.config.river;
        
        this.RIVER_MODEL = { normal: 5, riichi: 1, cols: 6 };
        const riverW = (this.RIVER_MODEL.normal * rW) + (this.RIVER_MODEL.riichi * rH) + ((this.RIVER_MODEL.cols - 1) * rGap);

        const infoBoxH = 120;
        const infoGap = 15;

        const tileCfg = this.config.tile;
        const handWidth = 14 * (tileCfg.w + tileCfg.gap);
        
        this.ZONES = {
            comHand:     { x: W * 0.17, y: H * 0.15, width: handWidth },
            comRiver:    { 
                x: CX - riverW / 2, 
                y: CY - (infoBoxH / 2) - infoGap - rH, 
                cols: this.RIVER_MODEL.cols, 
                width: riverW,
                direction: { x: -1, y: -1 } // COM：從右往左、從下往上
                    },
            comMeld:     { x: W * 0.12, y: H * 0.15 },
            
            playerHand:  { x: W * 0.15, y: H * 0.80, width: handWidth },
            playerRiver: { 
                x: CX - riverW / 2, 
                y: CY + (infoBoxH / 2) + infoGap, 
                cols: this.RIVER_MODEL.cols, 
                width: riverW,
                direction: { x: 1, y: 1 } // 玩家：從左往右、從上到下
                    },
            playerMeld:  { x: W * 0.88, y: H * 0.80 + (76 - 56) }          
        };
    }

    /* =================================================================
       Core Loop (核心繪製循環)
       ================================================================= */
    draw() {
        const ctx = this.ctx;
        const baseSize = this.viewport.baseSize || this.config.width;
        const s = this.viewport.scale || 1;

        ctx.setTransform(s, 0, 0, s, 0, 0);
        ctx.clearRect(0, 0, baseSize, baseSize);
        
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        // 1. 底層與遊戲物件
        this._drawBackground();
        this._drawRivers();   
        this._drawHands();
        this._drawAnimations();

        // 2. UI 基礎層 (InfoBox 永遠出現)
        this._drawInfoBox(); 
        
        // 3. 汪汪標記層 (判斷：只有「非結算第一階段」才顯示)
        this._drawGameMarkers(); 

        // 4. 頂層：UI按鈕 與 結算內容
        this._renderTopOverlay();
    }


    /* =================================================================
       State Updates (邏輯更新)
       ================================================================= */

    _updateState() {
        // --- 1. 翻牌動畫處理 ---
        if (this.gameState.phase === "DEAL_FLIP") {
            if (!this._flipTriggered) {
                this.startFlipHandAnimation(0);
                this._flipTriggered = true;
            }
            const isFlipping = this.animations.some(a => a.type === "flip");
            if (!isFlipping && this._flipTriggered) {
                this.gameState.players[0].handFaceDown = false;
            }
        } else {
            this._flipTriggered = false;
        }

        // --- 2. 核心邏輯檢查 ---
        // 檢查是否有新摸牌 (並在裡面判斷 tepai 內容變化)
        this._checkHandChanges();
    
        // --- 3. 座標與視覺效果更新 (理牌靈魂) ---
        // 更新手牌的平滑 X 座標 (讓牌動起來滑向正確位置)
        this._updateHandPositions(); 
    
        // 更新手牌懸浮效果 (玩家 Hover)
        this._updateHandHoverEffects();
    
        // 更新分數跳動
        this._updateScoreAnimation();
    }

    _updateHandPositions() {
        [0, 1].forEach(pIdx => {
            const player = this.gameState.players[pIdx];
            const isCom = pIdx === 1;
            const zone = isCom ? this.ZONES.comHand : this.ZONES.playerHand;
            const cfg = this.config.tile;
            const dirX = (isCom ? -1 : 1);
            const physics = isCom ? this.handPhysics.com : this.handPhysics.player;

            player.tepai.forEach((_, i) => {
                const targetX = this._calculateTileX(i, player.tepai.length, zone, cfg, dirX);
                
                // 1. 初始檢查：如果該位置還沒座標，直接設為目標（防止閃爍）
                if (physics.currentXs[i] === undefined || isNaN(physics.currentXs[i])) {
                    physics.currentXs[i] = targetX;
                    return;
                }

                // 2. 判定是否需要平滑移動
                // 如果是 COM 立直，或是差距極小，就直接歸位（摸切就不會動了）
                const dist = Math.abs(targetX - physics.currentXs[i]);
                if ((isCom && player.isReach) || dist < 0.5) {
                    physics.currentXs[i] = targetX;
                } else {
                    // 3. 核心：線性平滑位移 (Lerp)
                    // 這裡的 0.12 可以微調：0.1 慢一點，0.2 快一點汪
                    physics.currentXs[i] += (targetX - physics.currentXs[i]) * 0.12;
                }
            });

            // 確保陣列長度跟手牌一樣，多的座標直接切掉
            if (physics.currentXs.length < player.tepai.length) {
                physics.currentXs.length = player.tepai.length;
            }
        });
    }    

    _updateScoreAnimation() {
        const players = this.gameState.players;
        const now = performance.now();
        const DELAY_MS = 800; 

        // 1. 目標鎖定偵測 (不變)
        let hasNewTarget = false;
        players.forEach((p, i) => {
            if (p.points !== this.scoreState.lastTargets[i]) {
                this.scoreState.lastTargets[i] = p.points;
                hasNewTarget = true;
            }
        });

        if (hasNewTarget) {
            this.scoreState.animStartTime = now + DELAY_MS;
        }

        if (now < this.scoreState.animStartTime) {
            this.scoreState.display = this.scoreState.visual.map(Math.round);
            return; 
        }

        let allFinished = true;

        players.forEach((p, i) => {
            const target = p.points;
            let current = this.scoreState.visual[i];
            const diff = target - current;

            if (Math.abs(diff) > 0.5) {
                allFinished = false;

                /**
                 * 🎰 吃角子老虎機核心算法：
                 * 1. 使用一個較大的係數 (0.15~0.2) 來產生初期的爆發力。
                 * 2. 為了維持跳動感，當差距變小時，我們不直接等於 target，而是維持一個最小速度。
                 * 3. Math.ceil(Math.abs(diff) * 0.2) 確保每次跳動至少 1 點。
                 */
                
                // 基礎平滑公式: v = (target - current) * lerpFactor
                // 加入隨機抖動感 (Slot Machine 特色)：
                const jitter = (Math.random() - 0.5) * 2; // -1 ~ 1 的微小抖動
                
                // 計算步進值
                let step = diff * 0.18; 
                
                // 確保「最小步進」：當 diff 很小時，強迫它跳動，而不是無限逼近
                if (Math.abs(step) < 50) {
                    step = Math.sign(diff) * Math.min(Math.abs(diff), 50);
                }
                
                this.scoreState.visual[i] += step;

                // 觸發音效的好時機 (如果需要汪)：
                // if (Math.round(this.scoreState.visual[i]) % 100 === 0) playTickSound();

            } else {
                this.scoreState.visual[i] = target;
            }
        });

        this.scoreState.display = this.scoreState.visual.map(Math.round);

        // 結算階段自動推動
        if (this.gameState.phase === "ROUND_END" && 
            this.gameState.resultClickStage === 1 && 
            allFinished) {
            // 動畫完全停止後，延遲一小段時間再進下一階段，更有儀式感
            if (!this.scoreState.finishTimeout) {
                this.scoreState.finishTimeout = setTimeout(() => {
                    this.gameState.resultClickStage = 2;
                    this.scoreState.finishTimeout = null;
                }, 500);
            }
        }
    }

    // 檢查是否需要新增「摸牌動畫」
    /**
    * 輔助函式：處理單個玩家的動畫檢查
    * @param {number} playerIdx 玩家索引
    * @param {string} lastLenProp 手牌長度紀錄屬性名
    * @param {string} lastMeldProp 副露數量紀錄屬性名
    * @param {string} zoneKey 區域 key
    * @param {boolean} isCom 是否為電腦
    */
    // 檢查是否需要新增「摸牌動畫」或「處理打牌理牌」
    _checkHandChanges() {
        const check = (playerIdx, lastLenProp, lastMeldProp, zoneKey, isCom) => {
            const player = this.gameState.players[playerIdx];
            const currentLen = player.tepai.length;
            const lastLen = this.handState[lastLenProp];
            const lastTepai = this.handState.lastTepai[playerIdx] || [];

            // === A. 偵測打牌 ===
            if (currentLen < lastLen) {
                // 1. 找出哪一張牌被切掉
                let removedIndex = lastLen - 1;
                for (let i = 0; i < currentLen; i++) {
                    if (lastTepai[i] !== player.tepai[i]) {
                        removedIndex = i;
                        break;
                    }
                }

                const physics = isCom ? this.handPhysics.com : this.handPhysics.player;
                
                /**
                 * 🌟 實現「空切移動」的邏輯：
                 * 當你 splice 座標陣列後，原本在 removedIndex 後方的牌座標會往前遞補。
                 * 此時它們的新 targetX 會變動，但 currentXs 還停留在舊位置。
                 * 下一幀 _updateHandPositions 就會平穩地把牌往左拉，形成補位動畫汪！
                 * 如果是「摸切」(removedIndex 是最後一張)，則前面的牌位置都不會變。
                 */
                if (physics.currentXs.length > removedIndex) {
                    physics.currentXs.splice(removedIndex, 1);
                }
            }

            // === B. 摸牌動畫邏輯 (保持原樣即可) ===
            // ... (這部分維持你提供的代碼即可) ...
            const validPhases = ["DEALING", "DEALING_WAIT", "DEAL_FLIP", "DRAW", 
                                "PLAYER_DECISION", "COM_DECISION", "ROUND_END"];
            const currentMeld = player.fulu.length;
            const lastMeld = this.handState[lastMeldProp];
            const isKanDraw = (currentMeld > lastMeld) && (currentLen % 3 === 2);
        
            if (validPhases.includes(this.gameState.phase) && (currentLen > lastLen || isKanDraw)) {
                let startIndex = isKanDraw ? currentLen - 1 : lastLen;
                let count = isKanDraw ? 1 : currentLen - lastLen;
                const zone = this.ZONES[zoneKey];
                const cfg = this.config.tile;
                const dirX = zone.direction?.x ?? (isCom ? -1 : 1);

                for (let i = 0; i < count; i++) {
                    const idx = startIndex + i;
                    if (this.animations.some(a => a.isCom === isCom && a.index === idx)) continue;
                    let tx = this._calculateTileX(idx, currentLen, zone, cfg, dirX);
                    this.animations.push({
                        type: "draw", isCom, tile: isCom ? -1 : player.tepai[idx],
                        index: idx, x: tx, y: zone.y,
                        startX: tx, startY: zone.y + (isCom ? 40 : -40), 
                        startTime: performance.now(), duration: 300
                    });
                }
            }
        
            // 更新狀態紀錄
            this.handState[lastLenProp] = currentLen;
            this.handState[lastMeldProp] = currentMeld;
            this.handState.lastTepai[playerIdx] = [...player.tepai];
        };

        check(0, "lastLen0", "lastMeld0", "playerHand", false);
        check(1, "lastLen1", "lastMeld1", "comHand", true);
    }
    
    // 輔助方法：計算 X 座標
    _calculateTileX(idx, total, zone, cfg, dirX) {
        const isDealing = ["DEALING", "DEALING_WAIT", "DEAL_FLIP"].includes(this.gameState.phase);
        const isDrawState = !isDealing && (total % 3 === 2);
        
        let tx;
        if (dirX > 0) {
            tx = zone.x + idx * (cfg.w + cfg.gap);
            if (isDrawState && idx === total - 1) tx += cfg.drawGap;
        } else {
            tx = zone.x + zone.width - (idx + 1) * (cfg.w + cfg.gap);
            if (isDrawState && idx === total - 1) tx -= cfg.drawGap;
        }
        return tx;
    }

    _updateHandHoverEffects() {
        const offsetTarget = -16; // 懸浮高度
        this.handState.yOffsets.forEach((val, i) => {
            const target = (this.hoveredIndex === i) ? offsetTarget : 0;
            // 線性插值 (Lerp) 平滑移動
            this.handState.yOffsets[i] = val * 0.7 + target * 0.3;
        });
    }

    /**
     * 啟動手牌翻轉動畫 (一次全翻版)
     */
    startFlipHandAnimation(playerIdx) {
        const player = this.gameState.players[playerIdx];
        const isCom = playerIdx === 1;
        if (isCom) return; 

        const zone = this.ZONES.playerHand;
        const cfg = this.config.tile;
        
        const now = performance.now(); 
        const startDelay = 250;

        player.tepai.forEach((tile, i) => {
            let x = zone.x + i * (cfg.w + cfg.gap);
            const y = zone.y; 

            this.animations.push({
                type: "flip",
                isCom: false,
                tile,       
                index: i,   
                x, y,
                startTime: now + startDelay, 
                duration: 1200 // 翻轉速度 (毫秒)
            });
        });
    }

    /* =================================================================
       Render Scene (場景繪製)
       ================================================================= */

    _renderScene() {
        this._drawBackground();
        this._drawRivers();
        this._drawHands();
        this._drawAnimations(); // 繪製飛行中的牌
    }

    _drawBackground() {
        const ctx = this.ctx;
        const W = this.config.width;
        const H = this.config.height;

        if (this.assets.table) {
            ctx.drawImage(this.assets.table, 0, 0, W, H);
        } else {
            const cx = W / 2, cy = H / 2;
            const grad = ctx.createRadialGradient(cx, cy, 100, cx, cy, 700);
            grad.addColorStop(0, "#1e4d3e");
            grad.addColorStop(1, "#0a1a15");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
            ctx.lineWidth = 15;
            ctx.strokeRect(0, 0, W, H);
        }
        }


    /**
     * 繪製雙方的牌河
     */
    _drawRivers() {
        this._lastMarkedPaws = null; // 每一幀重置肉球位置

        // 1. 繪製玩家牌河 (Player Index 0)
        this._drawRiverGroup(
            this.gameState.players[0].river, 
            this.ZONES.playerRiver, 
            false
        );

        // 2. 繪製電腦牌河 (Player Index 1)
        this._drawRiverGroup(
            this.gameState.players[1].river, 
            this.ZONES.comRiver, 
            true
        );
    }

    /**
     * 核心：處理單一區域的牌河渲染
     */
    _drawRiverGroup(riverData, zone, isCom) {
        if (!riverData || !Array.isArray(riverData)) return;

        const { w, h, gap = 5 } = this.config.river;
        const { cols } = zone;

        let currentRollOffsetX = 0; 
        
        riverData.forEach((item, i) => {
            let tileVal = item;
            let isRiichi = false;
            if (typeof item === 'object' && item !== null) {
                tileVal = item.tile ?? item.value ?? item.pai; 
                isRiichi = item.isRiichi || item.riichi || false;
            }

            if (tileVal === undefined || tileVal === null || tileVal < 0) return;

            if (i > 0 && i % cols === 0) currentRollOffsetX = 0;
            const row = Math.floor(i / cols);

            const visualW = isRiichi ? h : w;

            const extraSpace = 4; 
            const actualGap = gap + extraSpace;
            const shiftX = (visualW - w) / 2;

            let dx, dy;

            if (!isCom) {
                dx = zone.x + currentRollOffsetX + shiftX;
                dy = zone.y + row * (h + gap);
                if (isRiichi) dy -= (h - w) / 2;             
            } else {
                dx = (zone.x + zone.width) - currentRollOffsetX - visualW + shiftX;
                dy = zone.y - row * (h + gap);
                if (isRiichi) dy += (h - w) / 2;
            }

            // --- 旋轉角度計算 ---
            // 1. 基礎角度 (立直 90 度，普通 0 度)
            let baseRotate = 0;
            if (isRiichi) {
                baseRotate = isCom ? 90 : -90; 
            } else {
                baseRotate = isCom ? 180 : 0;
            }
            
            // 2. 加上微小隨機歪斜 (利用 i 作為種子，保證每幀角度固定)
            const jitter = Math.sin(i * 567.89) * 2.5;
            let finalRotate = baseRotate + jitter;

            const lastDiscard = this.gameState.lastDiscard;
            const isLast = lastDiscard && 
                           (i === riverData.length - 1) && 
                           (lastDiscard.fromPlayer === (isCom ? 1 : 0));

            // --- 繪製 ---
            this.drawTile(tileVal, dx, dy, w, h, { 
                rotate: finalRotate, 
                marked: isLast,
                noShadow: false
            });

            if (isLast) {
                this._lastMarkedPaws = { x: dx, y: dy, w, h, rotate: finalRotate };
            }

            currentRollOffsetX += visualW + actualGap;
        });
    }

    // === 手牌與副露繪製 ===
    _drawHands() {
        this._renderHand(0);  // 玩家 手牌
        this._renderHand(1);  // COM 手牌
        this._renderMelds(0); // 玩家 副露
        this._renderMelds(1); // COM 副露
    }

    _renderHand(playerIdx) {
        const player = this.gameState.players[playerIdx];
        const isCom = playerIdx === 1;
        const physics = isCom ? this.handPhysics.com : this.handPhysics.player;
        const zone = isCom ? this.ZONES.comHand : this.ZONES.playerHand;
        const cfg = this.config.tile;

        player.tepai.forEach((tile, i) => {
            // 動畫層優先
            const isAnimating = this.animations.some(a => 
                (a.type === "draw" || a.type === "flip") && 
                a.isCom === isCom && 
                a.index === i
            );
        
            if (isAnimating) return; 

            // 座標計算
            const x = (physics.currentXs && physics.currentXs[i] !== undefined) 
                      ? physics.currentXs[i] 
                      : zone.x;

            let y = zone.y + (!isCom ? (this.handState.yOffsets[i] || 0) : 0);

            // 玩家點擊回饋
            if (!isCom && this.hoveredIndex === i && this.isHandPressed) {
                y += 4; 
            }

            // --- COM 打牌動畫 ---
            const teaseAnim = this.animations.find(a => a.type === "discard_tease" && a.isCom === isCom && a.index === i);
            if (teaseAnim) {
                const elapsed = performance.now() - teaseAnim.startTime;
                const progress = Math.min(elapsed / teaseAnim.duration, 1);
                
                const jump = Math.sin(Math.min(progress * 2, 1) * (Math.PI / 2)) * 25; 
                y -= jump;
            }

            const faceDown = (player.handFaceDown === true) || (isCom && !this.gameState.debugRevealCom);

            this.drawTile(faceDown ? -1 : tile, x, y, cfg.w, cfg.h, {
                faceDown,
                selected: !isCom && !player.handFaceDown && this.hoveredIndex === i,
                rotate: isCom ? 180 : 0
            });
        });
    }

    _renderMelds(playerIdx) {
        const player = this.gameState.players[playerIdx];
        if (!player.fulu || player.fulu.length === 0) return;

        const zone = playerIdx === 0 ? this.ZONES.playerMeld : this.ZONES.comMeld;
        const { w, h } = this.config.meld;
        let curX = zone.x;

        player.fulu.forEach(meld => {
            const meldWidth = this._calculateMeldWidth(meld, w);
            
            // 計算繪製起點
            // 玩家(0)副露靠右，向左延伸；COM(1)副露靠左，向右延伸
            let drawX;
            if (playerIdx === 0) {
                drawX = curX - meldWidth;
            } else {
                drawX = curX;
            }

            this._drawSingleMeld(meld, drawX, zone.y, w, h);

            // 更新下一個副露的起始位置 (加上間距 10)
            if (playerIdx === 0) {
                curX -= (meldWidth + 10);
            } else {
                curX += (meldWidth + 10);
            }
        });
    }
    
    /**
     * 計算單一組副露的總寬度
     * @param {Object} meld 副露資料
     * @param {Number} tileW 單張牌寬度
     */
    _calculateMeldWidth(meld, tileW) {
        const isAnkan = meld.type === "ankan";
        const count = isAnkan ? 4 : 3;
        const gap = 2; // 副露內部牌與牌的間距
        return count * (tileW + gap);
    }

    /**
     * 繪製單一組副露
     * @param {Object} meld 副露資料
     * @param {Number} x 起始 X
     * @param {Number} y 起始 Y
     * @param {Number} tileW 牌寬
     * @param {Number} tileH 牌高
     * @returns {Number} 繪製的總寬度
     */
    _drawSingleMeld(meld, x, y, tileW, tileH) {
        const isAnkan = meld.type === "ankan";
        const count = isAnkan ? 4 : 3;
        const gap = 2;

        for (let i = 0; i < count; i++) {
            // 暗槓：第 1 張 (index 0) 和第 4 張 (index 3) 蓋牌
            const isFaceDown = isAnkan && (i === 0 || i === 3);
            
            this.drawTile(
                meld.tile, 
                x + i * (tileW + gap), 
                y, 
                tileW, 
                tileH, 
                { faceDown: isFaceDown }
            );
        }

        return count * (tileW + gap);
    }

    // === 動畫物件繪製 ===
    _drawAnimations() {
        const now = performance.now();
        const { w, h } = this.config.tile;

        this.animations = this.animations.filter(anim => {
            const elapsed = now - anim.startTime;

            if (elapsed < 0) {
                this.ctx.save();
                if (anim.type === "flip") {
                    this.drawTile(-1, anim.x, anim.y, w, h, { faceDown: true, noShadow: true });
                } 
                this.ctx.restore();
                return true; 
            }

            const progress = Math.min(Math.max(elapsed / anim.duration, 0), 1);

            // ===== A. 翻牌動畫 (Flip) =====
            if (anim.type === "flip") {
                const angle = progress * Math.PI;
                const { w, h } = this.config.tile; // 確保拿到最新的 w, h

                // 1. Y軸壓縮
                const scaleY = Math.abs(Math.cos(angle));

                // 2. X軸呼吸效果
                const breathingIntensity = 0.02;
                const breathing = Math.sin(progress * Math.PI) * breathingIntensity;
                const scaleX = 1 + breathing;

                // 3. 跳躍高度
                const jumpHeight = Math.sin(progress * Math.PI) * (h * 0.25);

                this.ctx.save();

                const pivotYOffset = h * 1.135;
                const pivotX = anim.x + w / 2;
                const pivotY = anim.y + pivotYOffset;

                // 移到新的軸心位置，並加上跳躍高度
                this.ctx.translate(pivotX, pivotY - jumpHeight);
                this.ctx.scale(scaleX, scaleY); 
                // 移回原點 (注意這裡要對應上面的 pivot)
                this.ctx.translate(-pivotX, -pivotY);

                // 決定正反面
                const showFaceDown = progress < 0.5;

                // 計算多出來的像素寬度，然後往左移一半，確保視覺中心不變。
                const extraWidthPx = w * breathing;
                const adjustX = -(extraWidthPx / 2);
                
                this.drawTile(
                    anim.tile,
                    anim.x + adjustX,
                    anim.y,
                    w,
                    h,
                    { 
                        faceDown: showFaceDown, 
                        noShadow: true 
                    }
                );

                this.ctx.restore();
                return progress < 1;
            }

            // ===== B. 飛行動畫 (Draw) =====
            const ease = progress * (2 - progress);
            const cx = anim.startX + (anim.x - anim.startX) * ease;
            const cy = anim.startY + (anim.y - anim.startY) * ease;

            this.ctx.save();
            const player = this.gameState.players[anim.isCom ? 1 : 0];
            const isFaceDown = player.handFaceDown || (anim.isCom && anim.type === "draw");
            
            this.drawTile(anim.tile, cx, cy, w, h, { faceDown: isFaceDown });
            this.ctx.restore();

            return progress < 1;
        });
    }

    /* =================================================================
       Render Overlay (UI 與結算層)
       ================================================================= */
    _drawGameMarkers() {
        if (this._lastMarkedPaws) {
            const { x, y, w, h, rotate } = this._lastMarkedPaws;
            this._drawPawMarker(x, y, w, h, rotate);
        }
    }

    _renderTopOverlay() {
        const phase = this.gameState.phase;

        // A. 處理 UI 按鈕 (玩家操作時)
        if (phase !== "ROUND_END") {
            this._drawUIButtons();
        }

        // B. 處理結算畫面 (這會蓋在 InfoBox 與 爪爪之上)
        if (phase === "ROUND_END" && this.gameState.resultClickStage === 0) {
            // 這裡 ResultRenderer 畫出來的東西會是最高優先級
            this.resultRenderer?.draw(this.gameState.lastResult);
        }
    }

    _drawInfoBox() {
        const ctx = this.ctx;
        const W = this.config.width;
        const H = this.config.height;
        const cx = W / 2, cy = H / 2;
        const boxW = 260, boxH = 120;

        // 背景框（也做像素對齊，避免線條糊）
        const x = this._snap(cx - boxW / 2);
        const y = this._snap(cy - boxH / 2);

        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8;

        ctx.save();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        // 外框
        ctx.strokeStyle = `rgba(255, 204, 0, ${pulse * 0.4})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(this._snap(x - 2), this._snap(y - 2), this._snap(boxW + 4), this._snap(boxH + 4));

        // 黑底
        ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
        ctx.fillRect(x, y, boxW, boxH);

        const parentIdx = this.gameState.parentIndex;
        const role = (idx) => (parentIdx === idx ? "[親]" : "[子]");
        const scoreValue = (idx) => Math.floor(this.scoreState.display[idx]);

        // 流局：InfoBox 只顯示一行「荒牌流局」
        const isRyuukyokuInfo =
        (this.gameState.phase === "ROUND_END") &&
        (this.gameState.lastResult?.type === "ryuukyoku");

        if (isRyuukyokuInfo) {
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = `bold 34px ${this.config.fontFamily}`;
            this._drawCrispText("荒牌流局", cx, cy, {
                fill: "#aaddff",
                stroke: "rgba(0,0,0,0.65)",
                lineWidth: 3
            });
            ctx.restore();
            return;
        }

        // 顏色：分數跳動時提示
        const getScoreColor = (playerIdx) => {
            const target = this.gameState.players[playerIdx].points;
            const current = this.scoreState.display[playerIdx];
            if (target > current + 1) return "#ffcc00";
            if (target < current - 1) return "#ff4444";
            return this.config.colors.text;
        };

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // COM / 玩家
        ctx.font = `bold 22px ${this.config.fontFamily}`;
        this._drawCrispText(`${role(1)} COM：${scoreValue(1)}`, cx, cy - 35, {
            fill: getScoreColor(1),
            stroke: "rgba(0,0,0,0.6)",
            lineWidth: 2
        });

        // 餘牌：更大一點
        ctx.font = `bold 26px ${this.config.fontFamily}`;
        this._drawCrispText(`余：${this.gameState.yama.length}`, cx, cy + 2, {
            fill: this.config.colors.highlight,
            stroke: "rgba(0,0,0,0.65)",
            lineWidth: 2
        });

        // 玩家
        ctx.font = `bold 22px ${this.config.fontFamily}`;
        this._drawCrispText(`${role(0)} 玩家：${scoreValue(0)}`, cx, cy + 40, {
            fill: getScoreColor(0),
            stroke: "rgba(0,0,0,0.6)",
            lineWidth: 2
        });

        ctx.restore();
    }

    _drawUIButtons() {
        this.uiButtons = []; // 每次重置
        if (!this._isPlayerInteractive()) return;
        
        const actions = this.gameState.getLegalActions(0);
        const buttons = this._generateButtonList(actions);
        if (buttons.length === 0) return;
        
        const btnW = 100, btnH = 50, gap = 15;
        const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
        
        // 讓按鈕群組在手牌上方靠右對齊
        const startX = (this.ZONES.playerHand.x + 13 * (this.config.tile.w + this.config.tile.gap)) - totalW;
        const drawY = this.ZONES.playerHand.y - btnH - 25;
        
        // 正序處理
        buttons.forEach((btn, i) => {
            const currentX = startX + i * (btnW + gap);
            const isPressed = (this.pressedButtonIndex === i);
            
            // 1. 繪製
            this._drawSingleButton(currentX, drawY, btnW, btnH, btn, isPressed);
            
            // 2. 存入感應區 (順序跟 i 完全一致)
            this.uiButtons.push({ 
                x: currentX, y: drawY, w: btnW, h: btnH, 
                action: btn.action 
            });
        });
    }

    // 根據當前狀態生成按鈕列表
    _generateButtonList(actions) {
        const state = this.gameState;
        const list = [];
        const phase = state.phase;

        if (phase === "PLAYER_DECISION") {
            if (actions.canAnkan) list.push({ text: "槓", action: { type: "TRY_ANKAN" } });
            if (actions.canRiichi) list.push({ text: "立直", action: { type: "RIICHI" } });
            if (actions.canTsumo) list.push({ text: "自摸", action: { type: "TSUMO" } });
            if (list.length > 0) list.push({ text: "跳過", action: { type: "CANCEL" } });
        } 
        else if (phase === "ANKAN_SELECTION") {
            const player = state.players[0];
            const kanList = state.logic.getAnkanTiles(player.tepai, player.fulu.length, player.isReach ? player.riichiWaitSet : null);
            kanList.forEach(t => list.push({ tileIcon: t, action: { type: "ANKAN", tile: t } }));
            list.push({ text: "返回", action: { type: "CANCEL" } });
        } 
        else if (phase === "RIICHI_DECLARATION") {
            list.push({ text: "返回", action: { type: "CANCEL" } });
        } 
        else if (phase === "REACTION_DECISION") {
            if (actions.canRon) list.push({ text: "榮和", action: { type: "RON" } });
            list.push({ text: "跳過", action: { type: "CANCEL" } });
        }
        return list;
    }

    _drawSingleButton(x, y, w, h, btnData, isPressed) {
        const ctx = this.ctx;
        ctx.save();
        
        const offset = isPressed ? 3 : 0;
        const drawY = y + offset;

        // 陰影 (未按下時顯示厚度)
        if (!isPressed) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            this._fillRoundedRect(x, y + 4, w, h, 8);
        }

        // 漸層本體
        const grad = ctx.createLinearGradient(x, drawY, x, drawY + h);
        const [r, g, b] = isPressed ? this.config.colors.buttonPressed : this.config.colors.buttonBase;
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
        grad.addColorStop(1, `rgba(${r-30}, ${g-30}, ${b-30}, 1.0)`);
        ctx.fillStyle = grad;
        this._fillRoundedRect(x, drawY, w, h, 8);

        // 邊框
        ctx.strokeStyle = isPressed ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        this._strokeRoundedRect(x, drawY, w, h, 8);

        // 內容 (圖標或文字)
        if (btnData.tileIcon !== undefined) {
            this.drawTile(btnData.tileIcon, x + (w - 30)/2, drawY + (h - 42)/2, 30, 42, { noShadow: true });
        } else {
            ctx.font = `bold 26px ${this.config.fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            const fill = isPressed ? "#bbbbbb" : "#ffffff";
            this._drawCrispText(btnData.text, x + w/2, drawY + h/2, {
                fill,
                stroke: "rgba(0,0,0,0.55)",
                lineWidth: 2
            });
        }
        ctx.restore();
    }

    /* =================================================================
       Core Drawing Helper (單張牌繪製核心)
       ================================================================= */

    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown, highlight, selected, marked, rotate = 0, noShadow = false } = options;
        const ctx = this.ctx;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];

        ctx.save();

        // 1. 座標轉換 (處理旋轉)
        if (rotate !== 0) {
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((rotate * Math.PI) / 180);
            ctx.translate(-(x + w / 2), -(y + h / 2));
        }

        // 2. 陰影設定
        if (!noShadow) {
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 3;
        }

        // 3. 繪製圖片或色塊
        if (img) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            ctx.fillStyle = faceDown ? "#234" : "#f5f5f5";
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
        ctx.shadowColor = "transparent"; // 關閉陰影以免影響邊框

        // 4. 各種高亮框 (Highlighter)
        const drawBorder = (color, lw) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            this._strokeRoundedRect(x, y, w, h, 5);
        };

        if (highlight) drawBorder("#ff4444", 4);
        if (selected) drawBorder("rgba(255, 255, 255, 0.7)", 4);
        
        // 5. 特殊標記 (呼吸燈效果)
        if (marked) {
            const bounce = Math.sin(Date.now() / 200) * 5;
            ctx.save(); // 保護一下狀態
            ctx.strokeStyle = `rgba(255, 120, 150, ${0.5 + bounce / 10})`;
            ctx.lineWidth = 3;
            this._strokeRoundedRect(x, y, w, h, 5);
            ctx.restore();
        }

        ctx.restore(); // 還原座標系 (旋轉結束)
    }

    _drawPawMarker(x, y, w, h, rotate) {
        const ctx = this.ctx;
        const now = Date.now();
        
        // 1. 動態計算
        const bounce = Math.sin(now / 200) * 5;        
        const visualH = (rotate !== 0) ? w : h; 
        const centerY = y + h / 2;
        const pawX = x + w / 2;
        // 稍微往上抬一點點，避免壓到牌的邊框
        const pawY = centerY - (visualH / 2) - 30 + bounce;
        
        ctx.save();
        ctx.globalAlpha = 0.85; 
        ctx.fillStyle = "rgba(255, 120, 150, 0.95)"; // 顏色稍微加深一點點
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 4;
        
        // --- 繪製肉球核心 ---
        
        // 2. 掌心 (改成橢圓形更像肉墊)
        ctx.beginPath();
        // ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle)
        ctx.ellipse(pawX, pawY + 2, 12, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 3. 手指 (調整偏移量，讓中間那根高一點，兩側張開一點)
        const toes = [ [0, -10], [-10, -5], [10, -5] ];
        toes.forEach(([ox, oy]) => {
            ctx.beginPath();
            // 手指也改成稍微橢圓，或是維持正圓 (這裡用 4.5 徑長增加肉感)
            ctx.arc(pawX + ox, pawY + oy, 6, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    }

    /* =================================================================
       Helpers (工具函式)
       ================================================================= */
    
    // 把世界座標對齊到 device pixel，再除回世界座標
    _snap(v) {
        const s = this.viewport.scale || 1;
        return Math.round(v * s) / s;
    }

    // 文字：先描邊再填色，並對齊像素
    _drawCrispText(text, x, y, {
        fill = "#fff",
        stroke = "rgba(0,0,0,0.55)",
        lineWidth = 2,
    } = {}) {
        const ctx = this.ctx;
        const sx = this._snap(x);
        const sy = this._snap(y);

        ctx.save();
        ctx.shadowColor = "transparent"; // 避免被外部陰影污染
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;

        // 先描邊增加筆畫分離
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.strokeText(text, sx, sy);

        // 再填色
        ctx.fillStyle = fill;
        ctx.fillText(text, sx, sy);

        ctx.restore();
    }
    
    _fillRoundedRect(x, y, w, h, r) {
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, r);
        this.ctx.fill();
    }

    _strokeRoundedRect(x, y, w, h, r) {
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, r);
        this.ctx.stroke();
    }

    _isPlayerInteractive() {
        const state = this.gameState;
        if (state.phase === "PLAYER_DECISION" && state.turn === 0) return true;
        if (state.phase === "ANKAN_SELECTION" && state.turn === 0) return true;
        if (state.phase === "RIICHI_DECLARATION") return true;
        if (state.phase === "REACTION_DECISION" && state.lastDiscard?.fromPlayer !== 0) return true;
        return false;
    }
}
