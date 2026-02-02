/**
 * renderer.js
 * 負責將 GameState 視覺化繪製到 Canvas 上
 * 包含：背景、對局資料(手牌、牌河)管理、動畫系統、UI 交互繪製
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
            // 手牌尺寸
            tile: { w: 48, h: 76, gap: 2, drawGap: 20 },
            // 牌河尺寸 (比較小一點)
            river: { w: 40, h: 56, gap: 2 },
            // 副露尺寸
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
        this.uiButtons = [];      
        this.animations = [];     
        this.hoveredIndex = -1;   
        this.pressedButtonIndex = -1; 
        this._lastMarkedPaws = null; // 記錄最後打出的牌的位置 (為了畫肉球)

        // 手牌動畫狀態
        this.handState = {
            lastLen0: 0, lastLen1: 0,
            lastMeld0: 0, lastMeld1: 0,
            yOffsets: new Array(14).fill(0)
        };

        // 分數跳動狀態
        this.scoreState = {
            visual: [150000, 150000],      
            display: [0, 0],               
            lastTargets: [150000, 150000], 
            animStartTime: 0               
        };

        this.resultRenderer = new ResultRenderer(this);
    }

    /**
     * 初始化佈局座標
     * 這裡決定了牌河會出現在哪裡，非常重要！
     */
    _initLayout() {
        const { width: W, height: H } = this.config;
        const CX = W / 2;
        const CY = H / 2;
        const { w: rW, h: rH, gap: rGap } = this.config.river;
        
        // 牌河模型：預設一行 6 張
        const RIVER_COLS = 6;
        
        // 計算牌河總寬度 (用來置中)
        // 假設一行有 5 張普通牌 + 1 張立直牌 (最寬的情況) 來計算容器寬度
        const riverW = (5 * rW) + (1 * rH) + ((RIVER_COLS - 1) * rGap);

        const infoBoxH = 120; // 中間訊息框高度
        const infoGap = 20;   // 訊息框與牌河的間距

        const tileCfg = this.config.tile;
        const handWidth = 14 * (tileCfg.w + tileCfg.gap);
        
        this.ZONES = {
            // 電腦手牌
            comHand:     { x: W * 0.15, y: H * 0.15, width: handWidth },
            
            // 電腦牌河 (位於中心上方)
            comRiver:    { 
                x: CX - riverW / 2, 
                y: CY - (infoBoxH / 2) - infoGap - rH, 
                cols: RIVER_COLS, 
                width: riverW,
                // x: -1 代表從右往左排，y: -1 代表往上長 (遠離中心)
                direction: { x: -1, y: -1 } 
            },
            comMeld:     { x: W * 0.12, y: H * 0.15 + (76 - 56) },
            
            // 玩家手牌
            playerHand:  { x: W * 0.15, y: H * 0.80, width: handWidth },
            
            // 玩家牌河 (位於中心下方)
            playerRiver: { 
                x: CX - riverW / 2, 
                y: CY + (infoBoxH / 2) + infoGap, 
                cols: RIVER_COLS, 
                width: riverW,
                // x: 1 代表從左往右排，y: 1 代表往下長 (遠離中心)
                direction: { x: 1, y: 1 } 
            },
            playerMeld:  { x: W * 0.88, y: H * 0.80 + (76 - 56) }          
        };
    }

    // ... (Core Loop draw 和 _updateState 與之前相同，省略以節省篇幅，請保留原本代碼) ...
    // 請確保 draw() 裡面有呼叫 this._drawRivers();

    draw() {
        this._updateState();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this._drawBackground();
        this._drawRivers();    // <--- 關鍵：繪製牌河
        this._drawHands();
        this._drawAnimations();
        this._renderOverlay(); 
    }

    _updateState() {
        this._checkHandChanges();
        this._updateScoreAnimation();
        this._updateHandHoverEffects();
    }
    
    _updateScoreAnimation() {
        // (請保留原本的邏輯)
        const players = this.gameState.players;
        const now = performance.now();
        const DELAY_MS = 800;
        let hasNewTarget = false;
        players.forEach((p, i) => {
            if (p.points !== this.scoreState.lastTargets[i]) {
                this.scoreState.lastTargets[i] = p.points;
                hasNewTarget = true;
            }
        });
        if (hasNewTarget) this.scoreState.animStartTime = now + DELAY_MS;
        if (now < this.scoreState.animStartTime) {
            this.scoreState.display = this.scoreState.visual.map(Math.round);
            return; 
        }
        let allFinished = true;
        players.forEach((p, i) => {
            const target = p.points;
            const current = this.scoreState.visual[i];
            const diff = target - current;
            if (Math.abs(diff) > 0.1) {
                allFinished = false;
                const step = Math.max(100, Math.abs(diff) * 0.15);
                const move = Math.min(step, Math.abs(diff));
                this.scoreState.visual[i] += Math.sign(diff) * move;
            } else {
                this.scoreState.visual[i] = target;
            }
        });
        this.scoreState.display = this.scoreState.visual.map(Math.round);
        if (this.gameState.phase === "ROUND_END" && this.gameState.resultClickStage === 1 && allFinished) {
            this.gameState.resultClickStage = 2;
        }
    }

    _checkHandChanges() {
        // (請保留原本的邏輯，這裡省略)
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
                if (isKanDraw) { startIndex = currentLen - 1; count = 1; } 
                else { startIndex = lastLen; count = currentLen - lastLen; }
                
                const zone = this.ZONES[zoneKey];
                const cfg = this.config.tile;
                const dirX = zone.direction?.x ?? (isCom ? -1 : 1);
                const dirY = zone.direction?.y ?? (isCom ? -1 : 1);
                
                for (let i = 0; i < count; i++) {
                    const idx = startIndex + i;
                    if (this.animations.some(a => a.isCom === isCom && a.index === idx)) continue;
                    let tx = zone.x;
                    if (dirX > 0) {
                        tx += idx * (cfg.w + cfg.gap);
                        if (!isCom && idx === currentLen - 1) tx += cfg.drawGap; // 只有玩家有抽牌間隔
                    } else {
                        tx = zone.x + zone.width - (idx + 1) * (cfg.w + cfg.gap);
                        if (!isCom && idx === currentLen - 1) tx -= cfg.drawGap;
                    }
                    const ty = zone.y;
                    this.animations.push({
                        type: "draw", isCom, tile: isCom ? -1 : player.tepai[idx],
                        index: idx, x: tx, y: ty, startX: tx, startY: ty + (dirY < 0 ? 150 : -150),
                        startTime: performance.now(), duration: 400
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
        const offsetTarget = -16;
        this.handState.yOffsets.forEach((val, i) => {
            const target = (this.hoveredIndex === i) ? offsetTarget : 0;
            this.handState.yOffsets[i] = val * 0.7 + target * 0.3;
        });
    }

    // ... (_renderScene, _drawBackground 與之前相同) ...
    _renderScene() {
        this._drawBackground();
        this._drawRivers();
        this._drawHands();
        this._drawAnimations();
    }
    
    _drawBackground() {
        const { width: W, height: H } = this.canvas;
        if (this.assets.table) {
            this.ctx.drawImage(this.assets.table, 0, 0, W, H);
        } else {
            const cx = W / 2, cy = H / 2;
            const grad = this.ctx.createRadialGradient(cx, cy, 100, cx, cy, 700);
            grad.addColorStop(0, "#1e4d3e");
            grad.addColorStop(1, "#0a1a15");
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(0, 0, W, H);
            this.ctx.strokeStyle = "rgba(212, 175, 55, 0.4)";
            this.ctx.lineWidth = 15;
            this.ctx.strokeRect(0, 0, W, H);
        }
    }

    // =================================================================
    // ★ 牌河繪製核心 (修復重點)
    // =================================================================
    
    _drawRivers() {
        // 每幀重置，等待繪製時更新
        this._lastMarkedPaws = null; 
        
        // 1. 繪製玩家牌河 (資料, 區域, 是否為 COM)
        this._drawRiverGroup(
            this.gameState.players[0].kawa || [], // 防呆：如果 kawa 為 undefined 給空陣列
            this.ZONES.playerRiver, 
            false
        );

        // 2. 繪製電腦牌河
        this._drawRiverGroup(
            this.gameState.players[1].kawa || [], 
            this.ZONES.comRiver, 
            true
        );
    }

    /**
     * 繪製單邊牌河
     * @param {Array} riverData 牌河資料 [{tile: 1, isRiichi: false}, ...]
     * @param {Object} zone 區域設定 {x, y, cols, width, direction}
     * @param {Boolean} isCom 是否為電腦 (影響 lastDiscard 判定)
     */
    _drawRiverGroup(riverData, zone, isCom) {
        if (!riverData || riverData.length === 0) return;

        const { w, h, gap } = this.config.river;
        let curRow = 0;
        let curXOffset = 0;
        
        const dirX = zone.direction.x; // 1: 左到右, -1: 右到左
        const dirY = zone.direction.y; // 1: 上到下, -1: 下到上
        
        const lastDiscard = this.gameState.lastDiscard;
        // 判斷這一張牌是否為「場上最新打出的一張牌」(需要畫肉球標記)
        // 條件：最後打出者是本人，且現在正在畫這張牌
        const isThisPlayerTurn = lastDiscard?.fromPlayer === (isCom ? 1 : 0);
        
        riverData.forEach((item, i) => {
            // 1. 換行檢查
            // 注意：i > 0 確保第 0 張不會換行
            if (i > 0 && i % zone.cols === 0) {
                curRow++;
                curXOffset = 0; // 換行後，X 偏移歸零
            }
            
            // 2. 計算這張牌佔用的寬度 (立直牌橫放，佔用高度 h)
            const tileSpace = item.isRiichi ? h : w;
            
            // 3. 計算基準座標 (Base Coordinate)
            let dx = zone.x;
            let dy = zone.y;
            
            // X 軸計算
            if (dirX > 0) {
                // 玩家：從左邊開始 + 偏移量
                dx += curXOffset;
            } else {
                // COM：從最右邊 (x + width) 開始 - 偏移量 - 牌寬
                dx += zone.width - curXOffset - tileSpace;
            }
            
            // Y 軸計算 (每一行的高度變化)
            const rowHeight = h + gap;
            dy += (dirY > 0) ? (curRow * rowHeight) : -(curRow * rowHeight);
            
            // 4. 立直旋轉處理
            let rotate = 0;
            if (item.isRiichi) {
                // 玩家(dirX=1)轉-90度，COM(dirX=-1)轉90度，讓牌背對中心
                rotate = (dirX > 0) ? -90 : 90;
                
                // ★ 修正：旋轉後的中心點對齊
                // 因為 drawTile 是以中心旋轉，我們需要把視覺中心移回格子中心
                // 格子寬度是 h (56), 牌本身寬度是 w (40)
                // 偏移量 = (大 - 小) / 2
                const offset = (h - w) / 2;
                dx += offset; 
                dy += offset;
            }
            
            // 5. 判斷是否標記 (全場最後一張牌)
            const isGlobalLast = isThisPlayerTurn && (i === riverData.length - 1);
            
            // 6. 繪製
            this.drawTile(item.tile, dx, dy, w, h, { 
                rotate: rotate, 
                marked: isGlobalLast 
            });
            
            // 如果是最後一張，記錄位置給 overlay 畫肉球
            if (isGlobalLast) {
                this._lastMarkedPaws = { x: dx, y: dy, w, h, rotate };
            }
            
            // 7. 增加偏移量供下一張使用
            curXOffset += tileSpace + gap;
        });
    }

    // ... (_drawHands, _renderHand, _renderMelds, _calculateMeldWidth, _drawSingleMeld, _drawAnimations 與之前相同) ...
    
    _drawHands() {
        this._renderHand(0);
        this._renderHand(1);
        this._renderMelds(0);
        this._renderMelds(1);
    }

    _renderHand(playerIdx) {
        const player = this.gameState.players[playerIdx];
        const isCom = playerIdx === 1;
        const zone = isCom ? this.ZONES.comHand : this.ZONES.playerHand;
        const cfg = this.config.tile;
        const isDealing = this.gameState.phase === "DEALING";
        const isDrawState = !isDealing && (player.tepai.length % 3 === 2);
        const dirX = zone.direction?.x ?? (isCom ? -1 : 1);
        
        player.tepai.forEach((tile, i) => {
            if (this.animations.some(a => a.isCom === isCom && a.index === i)) return;
            
            let x = zone.x;
            if (dirX > 0) {
                x += i * (cfg.w + cfg.gap);
                if (isDrawState && i === player.tepai.length - 1) x += cfg.drawGap;
            } else {
                const zoneWidth = zone.width ?? (player.tepai.length * (cfg.w + cfg.gap));
                x = zone.x + zoneWidth - (i + 1) * (cfg.w + cfg.gap);
                if (isDrawState && i === player.tepai.length - 1) x -= cfg.drawGap;
            }
            const y = zone.y + (isCom ? 0 : this.handState.yOffsets[i]);
            this.drawTile(isCom ? -1 : tile, x, y, cfg.w, cfg.h, { faceDown: isCom, selected: !isCom && this.hoveredIndex === i });
        });
    }

    _renderMelds(playerIdx) {
        const player = this.gameState.players[playerIdx];
        if (!player.fulu.length) return;
        const zone = playerIdx === 0 ? this.ZONES.playerMeld : this.ZONES.comMeld;
        const { w, h } = this.config.meld;
        let curX = zone.x;
        player.fulu.forEach(meld => {
            const isAnkan = meld.type === "ankan";
            const tileCount = isAnkan ? 4 : 3;
            const meldWidth = tileCount * (w + 2);
            let drawX = (playerIdx === 0) ? curX - meldWidth : curX;
            for (let i = 0; i < tileCount; i++) {
                const isFaceDown = isAnkan && (i === 0 || i === 3);
                this.drawTile(meld.tile, drawX + i * (w + 2), zone.y, w, h, { faceDown: isFaceDown });
            }
            if (playerIdx === 0) curX -= (meldWidth + 10);
            else curX += (meldWidth + 10);
        });
    }
    
    _drawAnimations() {
        const now = performance.now();
        const { w, h } = this.config.tile;
        this.animations = this.animations.filter(anim => {
            const elapsed = now - anim.startTime;
            const progress = Math.min(elapsed / anim.duration, 1);
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

    // ... (_renderOverlay, _drawInfoBox, _drawUIButtons, _generateButtonList, _drawSingleButton 與之前相同) ...
    _renderOverlay() {
        const phase = this.gameState.phase;
        if (phase !== "ROUND_END" && this._lastMarkedPaws) {
            const { x, y, w, h, rotate } = this._lastMarkedPaws;
            this._drawPawMarker(x, y, w, h, rotate);
        }
        if (phase === "ROUND_END") {
            if (this.gameState.resultClickStage === 0) {
                this.resultRenderer?.draw(this.gameState.lastResult);
            } else {
                this._drawInfoBox();
            }
        } else {
            this._drawUIButtons();
            this._drawInfoBox();
        }
    }

    _drawInfoBox() {
        const ctx = this.ctx;
        const { width: W, height: H } = this.canvas;
        const cx = W / 2, cy = H / 2;
        const boxW = 260, boxH = 120;
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
        const getScoreColor = (playerIdx) => {
            const target = this.gameState.players[playerIdx].points;
            const current = this.scoreState.display[playerIdx];
            if (target > current + 1) return "#ffcc00"; 
            if (target < current - 1) return "#ff4444"; 
            return this.config.colors.text; 
        };
        
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `bold 20px ${this.config.fontFamily}`;
        ctx.fillStyle = getScoreColor(1);
        ctx.fillText(`${role(1)} COM：${scoreValue(1)}`, cx, cy - 35);
        ctx.font = `bold 24px ${this.config.fontFamily}`;
        ctx.fillStyle = this.config.colors.highlight;
        ctx.fillText(`余：${this.gameState.yama.length}`, cx, cy + 2);
        ctx.font = `bold 20px ${this.config.fontFamily}`;
        ctx.fillStyle = getScoreColor(0);
        ctx.fillText(`${role(0)} 玩家：${scoreValue(0)}`, cx, cy + 40);
    }

    _drawUIButtons() {
        this.uiButtons = [];
        if (!this._isPlayerInteractive()) return;
        const actions = this.gameState.getLegalActions(0);
        const buttons = this._generateButtonList(actions);
        if (buttons.length === 0) return;
        const btnW = 100, btnH = 50, gap = 15;
        const totalW = buttons.length * btnW + (buttons.length - 1) * gap;
        const startX = (this.ZONES.playerHand.x + 13 * (this.config.tile.w + this.config.tile.gap)) - totalW;
        const drawY = this.ZONES.playerHand.y - btnH - 25;
        buttons.forEach((btn, i) => {
            const currentX = startX + i * (btnW + gap);
            const isPressed = (this.pressedButtonIndex === i);
            this._drawSingleButton(currentX, drawY, btnW, btnH, btn, isPressed);
            this.uiButtons.push({ x: currentX, y: drawY, w: btnW, h: btnH, action: btn.action });
        });
    }

    _generateButtonList(actions) {
        const state = this.gameState;
        const list = [];
        const phase = state.phase;
        if (phase === "PLAYER_DECISION") {
            if (actions.canAnkan) list.push({ text: "槓", action: { type: "TRY_ANKAN" } });
            if (actions.canRiichi) list.push({ text: "立直", action: { type: "RIICHI" } });
            if (actions.canTsumo) list.push({ text: "自摸", action: { type: "TSUMO" } });
            if (list.length > 0) list.push({ text: "跳過", action: { type: "CANCEL" } });
        } else if (phase === "ANKAN_SELECTION") {
            const player = state.players[0];
            const kanList = state.logic.getAnkanTiles(player.tepai, player.fulu.length, player.isReach ? player.riichiWaitSet : null);
            kanList.forEach(t => list.push({ tileIcon: t, action: { type: "ANKAN", tile: t } }));
            list.push({ text: "返回", action: { type: "CANCEL" } });
        } else if (phase === "RIICHI_DECLARATION") {
            list.push({ text: "返回", action: { type: "CANCEL" } });
        } else if (phase === "REACTION_DECISION") {
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
        if (!isPressed) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
            this._fillRoundedRect(x, y + 4, w, h, 8);
        }
        const grad = ctx.createLinearGradient(x, drawY, x, drawY + h);
        const [r, g, b] = isPressed ? this.config.colors.buttonPressed : this.config.colors.buttonBase;
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.8)`);
        grad.addColorStop(1, `rgba(${r-30}, ${g-30}, ${b-30}, 1.0)`);
        ctx.fillStyle = grad;
        this._fillRoundedRect(x, drawY, w, h, 8);
        ctx.strokeStyle = isPressed ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        this._strokeRoundedRect(x, drawY, w, h, 8);
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

    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown, highlight, selected, marked, rotate = 0, noShadow = false } = options;
        const ctx = this.ctx;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];
        ctx.save();
        if (rotate !== 0) {
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((rotate * Math.PI) / 180);
            ctx.translate(-(x + w / 2), -(y + h / 2));
        }
        if (!noShadow) {
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 3;
        }
        if (img) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            // 如果圖片沒載入，會顯示這個灰底色塊
            ctx.fillStyle = faceDown ? "#234" : "#f5f5f5";
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
        }
        ctx.shadowColor = "transparent";
        const drawBorder = (color, lw) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            this._strokeRoundedRect(x, y, w, h, 5);
        };
        if (highlight) drawBorder("#ff4444", 4);
        if (selected) drawBorder("rgba(255, 255, 255, 0.7)", 4);
        if (marked) {
            const bounce = Math.sin(Date.now() / 200) * 5;
            ctx.save(); 
            ctx.strokeStyle = `rgba(255, 120, 150, ${0.5 + bounce / 10})`;
            ctx.lineWidth = 3;
            this._strokeRoundedRect(x, y, w, h, 5);
            ctx.restore();
        }
        ctx.restore(); 
    }

    _drawPawMarker(x, y, w, h, rotate) {
        const ctx = this.ctx;
        const now = Date.now();
        const bounce = Math.sin(now / 200) * 5; 
        const opacity = 0.7 + Math.sin(now / 200) * 0.3; 
        const visualH = (rotate !== 0) ? w : h; 
        const centerY = y + h / 2;
        const pawX = x + w / 2;
        const pawY = centerY - (visualH / 2) - 30 + bounce;
        ctx.save();
        ctx.globalAlpha = opacity; 
        ctx.fillStyle = "rgba(255, 120, 150, 0.95)";
        ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.ellipse(pawX, pawY + 2, 12, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        const toes = [ [0, -10], [-10, -5], [10, -5] ];
        toes.forEach(([ox, oy]) => {
            ctx.beginPath();
            ctx.arc(pawX + ox, pawY + oy, 4.5, 0, Math.PI * 2);
            ctx.fill();
        });
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
