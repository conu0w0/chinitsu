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

        // 設定 Canvas 解析度
        this.canvas.width = this.config.width;
        this.canvas.height = this.config.height;

        // === 2. 佈局計算 (Layout) ===
        this._initLayout();

        // === 3. 狀態追蹤 (State Tracking) ===
        this.uiButtons = [];      // 存儲當前幀的按鈕區域
        this.animations = [];     // 存儲進行中的動畫
        this.hoveredIndex = -1;   // 滑鼠懸停的手牌 Index
        this.pressedButtonIndex = -1; // 滑鼠按下的按鈕 Index

        // 手牌動畫狀態
        this.handState = {
            lastLen0: 0,  // 玩家手牌長度紀錄
            lastLen1: 0,  // COM 手牌長度紀錄
            lastMeld0: 0, // 玩家副露數量紀錄
            lastMeld1: 0, // COM 副露數量紀錄
            yOffsets: new Array(14).fill(0) // 玩家手牌懸浮動畫位移
        };

        // 分數跳動狀態
        this.scoreState = {
            visual: [150000, 150000],      // 當前顯示的分數 (動畫用)
            display: [0, 0],               // 最終渲染整數
            lastTargets: [150000, 150000], // 用來偵測分數是否發生變化
            animStartTime: 0               // 動畫允許開始的時間 (用於停頓)
        };

        // 子渲染器
        this.resultRenderer = new ResultRenderer(this);
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
            comHand:     { x: W * 0.15, y: H * 0.15, width: handWidth },
            comRiver:    { 
                x: CX - riverW / 2, 
                y: CY - (infoBoxH / 2) - infoGap - rH, 
                cols: this.RIVER_MODEL.cols, 
                width: riverW,
                direction: { x: -1, y: -1 } // COM：從右往左、從下往上
                    },
            comMeld:     { x: W * 0.12, y: H * 0.15 + (76 - 56) },
            
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
        this._updateState();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. 最底層：背景
        this._drawBackground();
        
        // 2. 中層：靜態遊戲物件 (牌河與手牌)
        this._drawRivers();   
        this._drawHands();
        
        // 3. 飛行中的動畫 (牌)
        this._drawAnimations();

        // 4. UI 與標記層
        this._renderOverlay(); 
    }

    /* =================================================================
       State Updates (邏輯更新)
       ================================================================= */

    _updateState() {
        // 檢查手牌變化 (觸發抽牌動畫)
        this._checkHandChanges();
        
        // 更新分數跳動
        this._updateScoreAnimation();
        
        // 更新手牌懸浮效果 (Hover Animation)
        this._updateHandHoverEffects();
    }

    // 更新分數顯示邏輯 (含停頓效果)
    _updateScoreAnimation() {
        const players = this.gameState.players;
        const now = performance.now();
        const DELAY_MS = 800; // ★ 設定停頓時間 (毫秒)，這裡設為 0.8 秒

        // 1. 檢查分數是否發生變化 (偵測 Target 改變)
        let hasNewTarget = false;
        players.forEach((p, i) => {
            if (p.points !== this.scoreState.lastTargets[i]) {
                this.scoreState.lastTargets[i] = p.points; // 更新紀錄
                hasNewTarget = true;
            }
        });

        // 2. 如果有新目標，設定動畫開始時間 (當前時間 + 延遲)
        if (hasNewTarget) {
            this.scoreState.animStartTime = now + DELAY_MS;
        }

        // 3. 如果還沒到開始時間，就暫停 (顯示舊分數，不做漸變)
        if (now < this.scoreState.animStartTime) {
            // 這裡必須確保 display 被更新為舊的 visual 值，避免畫面閃爍
            this.scoreState.display = this.scoreState.visual.map(Math.round);
            return; 
        }

        let allFinished = true;

        players.forEach((p, i) => {
            const target = p.points;
            const current = this.scoreState.visual[i];
            const diff = target - current;

            // 只有當差距大於 0.1 時才運算
            if (Math.abs(diff) > 0.1) {
                allFinished = false;
                // 動態步進：差距越大跳越快，最小步進 100
                const step = Math.max(100, Math.abs(diff) * 0.15);
                const move = Math.min(step, Math.abs(diff)); // 防止過頭
                this.scoreState.visual[i] += Math.sign(diff) * move;
            } else {
                this.scoreState.visual[i] = target;
            }
        });

        this.scoreState.display = this.scoreState.visual.map(Math.round);

        // 如果是結算階段且動畫跑完，自動進入下一階段
        if (this.gameState.phase === "ROUND_END" && 
            this.gameState.resultClickStage === 1 && 
            allFinished) {
            this.gameState.resultClickStage = 2;
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
    _checkHandChanges() {
        const check = (playerIdx, lastLenProp, lastMeldProp, zoneKey, isCom) => {
            const player = this.gameState.players[playerIdx];
            const currentLen = player.tepai.length;
            const currentMeld = player.fulu.length;
            
            const lastLen = this.handState[lastLenProp];
            const lastMeld = this.handState[lastMeldProp];
            
            const validPhases = ["DEALING", "DRAW", "PLAYER_DECISION", "COM_DECISION", "ROUND_END"];
            
            const isKanDraw = (currentMeld > lastMeld) && (currentLen % 3 === 2);
            
            if (validPhases.includes(this.gameState.phase) && (currentLen > lastLen || isKanDraw)) {
                let startIndex, count;
                
                if (isKanDraw) {
                    startIndex = currentLen - 1;
                    count = 1;
                } else {
                    startIndex = lastLen;
                    count = currentLen - lastLen;
                }
                
                const isDealing = (this.gameState.phase === "DEALING");
                const isDrawState = !isDealing && (currentLen % 3 === 2);
                
                const zone = this.ZONES[zoneKey];
                const cfg = this.config.tile;
                const dirX = zone.direction?.x ?? (isCom ? -1 : 1); // 預設左右方向
                const dirY = zone.direction?.y ?? (isCom ? -1 : 1); // 上下方向暫用（可做懸浮調整）
                
                for (let i = 0; i < count; i++) {
                    const idx = startIndex + i;
                    
                    if (this.animations.some(a => a.isCom === isCom && a.index === idx)) continue;
                    
                    // ==== 使用 direction 計算 x ====
                    let tx = zone.x;
                    if (dirX > 0) {
                        tx += idx * (cfg.w + cfg.gap);
                        if (isDrawState && idx === currentLen - 1) tx += cfg.drawGap;
                    } else {
                        tx = zone.x + zone.width - (idx + 1) * (cfg.w + cfg.gap);
                        if (isDrawState && idx === currentLen - 1) tx -= cfg.drawGap;
                    }
                    
                    // y 位置固定 zone.y，懸浮動畫靠 yOffsets
                    const ty = zone.y;
                    
                    // === 動畫物件 ===
                    this.animations.push({
                        type: "draw",
                        isCom,
                        tile: isCom ? -1 : player.tepai[idx],
                        index: idx,
                        x: tx, y: ty,
                        startX: tx, 
                        startY: ty + (dirY < 0 ? 150 : -150), // 從上方/下方飛入
                        startTime: performance.now(),
                        duration: 400
                    });
                }
            }
            
            this.handState[lastLenProp] = currentLen;
            this.handState[lastMeldProp] = currentMeld;
        };
        
        check(0, "lastLen0", "lastMeld0", "playerHand", false);
        check(1, "lastLen1", "lastMeld1", "comHand", true);
    }

    _updateHandHoverEffects() {
        const offsetTarget = -16; // 懸浮高度
        this.handState.yOffsets.forEach((val, i) => {
            const target = (this.hoveredIndex === i) ? offsetTarget : 0;
            // 線性插值 (Lerp) 平滑移動
            this.handState.yOffsets[i] = val * 0.7 + target * 0.3;
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
        const { width: W, height: H } = this.canvas;
        if (this.assets.table) {
            this.ctx.drawImage(this.assets.table, 0, 0, W, H);
        } else {
            // 預設漸層背景
            const cx = W / 2, cy = H / 2;
            const grad = this.ctx.createRadialGradient(cx, cy, 100, cx, cy, 700);
            grad.addColorStop(0, "#1e4d3e");
            grad.addColorStop(1, "#0a1a15");
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(0, 0, W, H);
            
            // 金色邊框
            this.ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
            this.ctx.lineWidth = 15;
            this.ctx.strokeRect(0, 0, W, H);
        }
    }

    // === 牌河繪製 ===
    _drawRiverGroup(riverData, zone, isCom) {
    if (!riverData || !Array.isArray(riverData)) return;

    const { w, h, gap = 2 } = this.config.river;
    const dirX = zone.direction.x;
    const dirY = zone.direction.y;
    
    // 每一列(row)的總高度偏移計算
    riverData.forEach((item, i) => {
        const tileVal = (typeof item === 'object') ? item.tile : item;
        const isRiichi = (typeof item === 'object') ? item.isRiichi : false;

        if (tileVal === undefined || tileVal === null) return;

        // 計算當前是第幾行、第幾列
        const row = Math.floor(i / zone.cols);
        const col = i % zone.cols;

        // --- 核心計算：X 座標 ---
        // 我們先算這張牌在這一行中的相對位置
        // 注意：立直牌會變寬 (h)，這裡為了簡化，通常牌河會預留固定格子或動態累加
        const tileSpace = isRiichi ? h : w;
        
        // 為了讓牌河整齊，我們可以用固定步進，或是像你之前用的 curXOffset
        // 這裡示範固定步進(方便對齊)或動態累加：
        let dx = zone.x;
        if (dirX > 1) { // 玩家
            dx += col * (w + gap); 
        } else { // COM
            // 從右邊邊界往回扣
            dx += zone.width - (col * (w + gap)) - w;
        }

        // --- 核心計算：Y 座標 ---
        let dy = zone.y;
        const rowOffset = row * (h + gap);
        dy += (dirY > 0) ? rowOffset : -rowOffset;

        // --- 旋轉修正 ---
        const rotate = isRiichi ? (isCom ? 90 : -90) : 0;
        
        // 如果旋轉了，Canvas 是繞中心轉，所以要把座標偏移修正回來
        let finalDx = dx;
        let finalDy = dy;
        if (isRiichi) {
            // 補償橫放造成的位移差 (h-w)/2
            finalDy += (h - w) / 2;
        }

        const isLast = (i === riverData.length - 1) && (this.gameState.lastDiscard?.fromPlayer === (isCom ? 1 : 0));
        
        this.drawTile(tileVal, finalDx, finalDy, w, h, { 
            rotate, 
            marked: isLast 
        });

        if (isLast) {
            this._lastMarkedPaws = { x: finalDx, y: finalDy, w, h, rotate };
        }
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
        const zone = isCom ? this.ZONES.comHand : this.ZONES.playerHand;
        const cfg = this.config.tile;
        const isDealing = this.gameState.phase === "DEALING";
        const isDrawState = !isDealing && (player.tepai.length % 3 === 2);
        const dirX = zone.direction?.x ?? (isCom ? -1 : 1);
        const dirY = zone.direction?.y ?? (isCom ? -1 : 1);
        
        player.tepai.forEach((tile, i) => {
            // 如果這張牌正在動畫中，跳過靜態繪製
            if (this.animations.some(a => a.isCom === isCom && a.index === i)) return;
            
            // 計算 x 座標
            let x = zone.x;
            if (dirX > 0) {
                x += i * (cfg.w + cfg.gap);
                if (isDrawState && i === player.tepai.length - 1) x += cfg.drawGap;
            } else {
                const zoneWidth = zone.width ?? (player.tepai.length * (cfg.w + cfg.gap));
                x = zone.x + zoneWidth - (i + 1) * (cfg.w + cfg.gap);
                if (isDrawState && i === player.tepai.length - 1) x -= cfg.drawGap;
            }
            
            // y 座標
            const y = zone.y + (isCom ? 0 : this.handState.yOffsets[i]); // 玩家懸浮效果
            
            // 繪製牌
            this.drawTile(isCom ? -1 : tile, x, y, cfg.w, cfg.h, { faceDown: isCom, selected: !isCom && this.hoveredIndex === i });
        });
    }

    _renderMelds(playerIdx) {
        const player = this.gameState.players[playerIdx];
        if (!player.fulu.length) return;

        const zone = playerIdx === 0 ? this.ZONES.playerMeld : this.ZONES.comMeld;
        const { w, h } = this.config.meld;
        let curX = zone.x;

        // 玩家副露靠右向左長，COM 副露靠左向右長
        player.fulu.forEach(meld => {
            const isAnkan = meld.type === "ankan";
            const tileCount = isAnkan ? 4 : 3;
            const meldWidth = tileCount * (w + 2);

            let drawX = (playerIdx === 0) ? curX - meldWidth : curX;

            // 繪製副露中的每張牌
            for (let i = 0; i < tileCount; i++) {
                const isFaceDown = isAnkan && (i === 0 || i === 3);
                this.drawTile(meld.tile, drawX + i * (w + 2), zone.y, w, h, { faceDown: isFaceDown });
            }

            // 更新下一組副露的起點
            if (playerIdx === 0) curX -= (meldWidth + 10);
            else curX += (meldWidth + 10);
        });
    }

    _drawRivers() {
        this._lastMarkedPaws = null;
        
        // 1. 繪製玩家牌河
        this._drawRiverGroup(
            this.gameState.players[0].kawa, 
            this.ZONES.playerRiver, 
            false
        );

        // 2. 繪製電腦牌河
        this._drawRiverGroup(
            this.gameState.players[1].kawa, 
            this.ZONES.comRiver, 
            true
        );
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

        // 過濾已完成的動畫，並繪製進行中的
        this.animations = this.animations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / anim.duration, 1);
            
            // easeOutQuad 緩動效果
            const ease = progress * (2 - progress);
            const cx = anim.startX + (anim.x - anim.startX) * ease;
            const cy = anim.startY + (anim.y - anim.startY) * ease;

            this.ctx.save();
            const isFaceDown = anim.isCom && anim.type === "draw";
            this.drawTile(anim.tile, cx, cy, w, h, { faceDown: isFaceDown });
            this.ctx.restore();

            return progress < 1;
        });
    }

    /* =================================================================
       Render Overlay (UI 與結算層)
       ================================================================= */

    _renderOverlay() {
        const phase = this.gameState.phase;

        // --- 處理肉球標記 (Paw Marker) ---
        // 只有在「非結算階段」才顯示肉球
        if (phase !== "ROUND_END" && this._lastMarkedPaws) {
            const { x, y, w, h, rotate } = this._lastMarkedPaws;
            this._drawPawMarker(x, y, w, h, rotate);
        }

        // --- 處理 UI 與 結算畫面 ---
        if (phase === "ROUND_END") {
            // 結算畫面邏輯
            if (this.gameState.resultClickStage === 0) {
                // ResultRenderer 的 draw 會覆蓋在上面
                this.resultRenderer?.draw(this.gameState.lastResult);
            } else {
                this._drawInfoBox();
            }
        } else {
            // 一般遊戲中
            this._drawUIButtons();
            this._drawInfoBox();
        }
    }

    _drawInfoBox() {
        const ctx = this.ctx;
        const { width: W, height: H } = this.canvas;
        const cx = W / 2, cy = H / 2;
        const boxW = 260, boxH = 120;
        
        // 背景框
        const x = cx - boxW / 2, y = cy - boxH / 2;
        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8; 
        
        ctx.strokeStyle = `rgba(255, 204, 0, ${pulse * 0.4})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 2, y - 2, boxW + 4, boxH + 4);
        
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(x, y, boxW, boxH);
        
        const parentIdx = this.gameState.parentIndex;
        const role = (idx) => (parentIdx === idx ? "[親]" : "[子]");
        const scoreValue = (idx) => Math.floor(this.scoreState.display[idx]);
        
        // 輔助函式：判斷顏色
        const getScoreColor = (playerIdx) => {
            const target = this.gameState.players[playerIdx].points;
            const current = this.scoreState.display[playerIdx];
            if (target > current + 1) return "#ffcc00"; // 增加中 (黃色)
            if (target < current - 1) return "#ff4444"; // 減少中 (紅色)
            return this.config.colors.text; // 無變動 (白色)
        };
        
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // 1. COM 資訊
        ctx.font = `bold 20px ${this.config.fontFamily}`;
        ctx.fillStyle = getScoreColor(1); // 動態顏色
        ctx.fillText(`${role(1)} COM：${scoreValue(1)}`, cx, cy - 35);
        
        // 2. 餘牌 (固定高亮色)
        ctx.font = `bold 24px ${this.config.fontFamily}`;
        ctx.fillStyle = this.config.colors.highlight;
        ctx.fillText(`余：${this.gameState.yama.length}`, cx, cy + 2);
        
        // 3. 玩家資訊
        ctx.font = `bold 20px ${this.config.fontFamily}`;
        ctx.fillStyle = getScoreColor(0); // 動態顏色
        ctx.fillText(`${role(0)} 玩家：${scoreValue(0)}`, cx, cy + 40);
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
            ctx.fillStyle = isPressed ? "#bbbbbb" : "#ffffff";
            ctx.font = `bold 22px ${this.config.fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(btnData.text, x + w/2, drawY + h/2);
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
        const opacity = 0.7 + Math.sin(now / 200) * 0.3; 
        
        const visualH = (rotate !== 0) ? w : h; 
        const centerY = y + h / 2;
        const pawX = x + w / 2;
        // 稍微往上抬一點點，避免壓到牌的邊框
        const pawY = centerY - (visualH / 2) - 30 + bounce;
        
        ctx.save();
        ctx.globalAlpha = opacity; 
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
            ctx.arc(pawX + ox, pawY + oy, 4.5, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.restore();
    }

    /* =================================================================
       Helpers (工具函式)
       ================================================================= */

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
