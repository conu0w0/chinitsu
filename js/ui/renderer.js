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
            river: { w: 40, h: 56 },
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
            lastLen0: 0, // 玩家手牌長度紀錄
            lastLen1: 0, // COM 手牌長度紀錄
            yOffsets: new Array(14).fill(0) // 玩家手牌懸浮動畫位移
        };

        // 分數跳動狀態
        this.scoreState = {
            visual: [150000, 150000], // 當前顯示的分數 (動畫用)
            display: [0, 0]           // 最終渲染整數
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
        const riverW = (5 * this.config.river.w) + this.config.river.h; // 預估一行寬度
        const infoBoxH = 120;
        const infoGap = 25;

        this.ZONES = {
            // 玩家區域
            playerHand:  { x: W * 0.15, y: H * 0.80 },
            playerRiver: { x: CX - (riverW / 2), y: CY + (infoBoxH / 2) + infoGap, cols: 6 },
            playerMeld:  { x: W * 0.88, y: H * 0.80 + (76 - 56) },

            // COM 區域
            comHand:     { x: W * 0.80, y: H * 0.15 },
            comRiver:    { x: CX - (riverW / 2), y: CY - (infoBoxH / 2) - infoGap - (0.8 * 56), cols: 6 },
            comMeld:     { x: W * 0.12, y: H * 0.15 + (76 - 56) }
        };
    }

    /* =================================================================
       Core Loop (核心繪製循環)
       ================================================================= */

    draw() {
        this._updateState();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // --- 調整後的順序 ---
        this._drawBackground();
        this._drawInfoBox();     
        this._drawRivers();   
        this._drawHands();
        this._drawAnimations();
        
        this._renderOverlay();  // 只有 UI 按鈕跟結算畫面會在最頂層
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

    // 更新分數顯示邏輯
    _updateScoreAnimation() {
        const players = this.gameState.players;
        let allFinished = true;

        players.forEach((p, i) => {
            const target = p.points;
            const current = this.scoreState.visual[i];
            const diff = target - current;

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
    _checkHandChanges() {
        // 輔助函式：處理單個玩家的動畫檢查
        const check = (playerIdx, lastLenProp, zoneKey, isCom) => {
            const player = this.gameState.players[playerIdx];
            const currentLen = player.tepai.length;
            const lastLen = this.handState[lastLenProp];
            
            // 只有在特定階段且牌數增加時才觸發
            const validPhases = ["DEALING", "DRAW", "PLAYER_DECISION", "COM_DECISION", "ROUND_END"];
            
            if (validPhases.includes(this.gameState.phase) && currentLen > lastLen) {
                const diff = currentLen - lastLen;
                const isDealing = (this.gameState.phase === "DEALING");
                const isDrawState = !isDealing && (currentLen % 3 === 2); // 判斷是否為摸牌動作

                for (let i = 0; i < diff; i++) {
                    const idx = lastLen + i;
                    // 避免重複添加
                    if (this.animations.some(a => a.isCom === isCom && a.index === idx)) continue;

                    // 計算目標位置
                    const zone = this.ZONES[zoneKey];
                    const cfg = this.config.tile;
                    let tx;
                    
                    if (!isCom) {
                        tx = zone.x + idx * (cfg.w + cfg.gap);
                        if (isDrawState && idx === currentLen - 1) tx += cfg.drawGap;
                    } else {
                        tx = zone.x - idx * (cfg.w + 2); // COM 向左排
                        if (isDrawState && idx === currentLen - 1) tx -= cfg.drawGap;
                    }

                    // 添加動畫物件
                    this.animations.push({
                        type: "draw",
                        isCom: isCom,
                        tile: isCom ? -1 : player.tepai[idx],
                        index: idx,
                        x: tx, y: zone.y,           // 終點
                        startX: tx, startY: zone.y + (isCom ? 150 : -150), // 起點 (從畫面外飛入)
                        startTime: performance.now(),
                        duration: 400
                    });
                }
            }
            this.handState[lastLenProp] = currentLen;
        };

        check(0, "lastLen0", "playerHand", false); // Player
        check(1, "lastLen1", "comHand", true);     // COM
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
    _drawRivers() {
        this._drawRiverGroup(this.gameState.players[0].river, this.ZONES.playerRiver, false);
        this._drawRiverGroup(this.gameState.players[1].river, this.ZONES.comRiver, true);
    }

    _drawRiverGroup(riverData, zone, isCom) {
        const { w, h } = this.config.river;
        let curRow = 0;
        let curXOffset = 0;

        riverData.forEach((item, i) => {
            // 換行邏輯
            if (i > 0 && i % zone.cols === 0) {
                curRow++;
                curXOffset = 0;
            }

            const tileSpace = item.isRiichi ? h : w;
            const rotate = item.isRiichi ? (isCom ? 90 : -90) : 0;
            
            // 計算繪製座標
            let dx = isCom 
                ? (zone.x + zone.cols * w) - curXOffset - tileSpace // COM 從右往左
                : zone.x + curXOffset;                              // Player 從左往右
            
            let dy = zone.y + curRow * h;

            // 立直牌的位置微調 (置中旋轉)
            if (rotate !== 0) {
                const offset = (h - w) / 2;
                dx += offset; dy += offset;
            }

            // 標記最後一張打出的牌
            const isLast = (this.gameState.lastDiscard?.fromPlayer === (isCom ? 1 : 0) && i === riverData.length - 1);

            this.drawTile(item.tile, dx, dy, w, h, { rotate, marked: isLast });
            curXOffset += tileSpace;
        });
    }

    // === 手牌與副露繪製 ===
    _drawHands() {
        this._renderPlayerHand();
        this._renderComHand();
        this._renderMelds(0); // Player Melds
        this._renderMelds(1); // COM Melds
    }

    _renderPlayerHand() {
        const player = this.gameState.players[0];
        const zone = this.ZONES.playerHand;
        const cfg = this.config.tile;
        const isDealing = (this.gameState.phase === "DEALING");
        const isDrawState = !isDealing && (player.tepai.length % 3 === 2);

        player.tepai.forEach((tile, i) => {
            // 如果這張牌正在動畫中，跳過靜態繪製
            if (this.animations.some(a => !a.isCom && a.index === i)) return;

            let x = zone.x + i * (cfg.w + cfg.gap);
            if (isDrawState && i === player.tepai.length - 1) x += cfg.drawGap;

            const y = zone.y + this.handState.yOffsets[i];

            this.drawTile(tile, x, y, cfg.w, cfg.h, {
                faceDown: player.handFaceDown,
                selected: (this.hoveredIndex === i)
            });
        });
    }

    _renderComHand() {
        const com = this.gameState.players[1];
        const zone = this.ZONES.comHand;
        const cfg = this.config.tile;
        const isDealing = (this.gameState.phase === "DEALING");
        const isDrawState = !isDealing && (com.tepai.length % 3 === 2);

        for (let i = 0; i < com.tepai.length; i++) {
            if (this.animations.some(a => a.isCom && a.index === i)) continue;

            let x = zone.x - i * (cfg.w + 2);
            if (isDrawState && i === com.tepai.length - 1) x -= cfg.drawGap;

            this.drawTile(-1, x, zone.y, cfg.w, cfg.h, { faceDown: true });
        }
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

        if (phase === "ROUND_END") {
            // 結算畫面邏輯
            if (this.gameState.resultClickStage === 0) {
                this.resultRenderer?.draw(this.gameState.lastResult);
            } else {
                // 動畫跑完後顯示 Info 讓玩家看分數
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
        
        // 畫框框背景
        const x = cx - boxW / 2, y = cy - boxH / 2;
        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8; 
        
        // 外發光框 (餘牌警示)
        ctx.strokeStyle = `rgba(255, 204, 0, ${pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, boxW + 4, boxH + 4);

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(x, y, boxW, boxH);
        
        // 文字內容
        const parentIdx = this.gameState.parentIndex;
        const role = (idx) => (parentIdx === idx ? "[親]" : "[子]");
        const score = (idx) => Math.floor(this.scoreState.display[idx]);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // COM
        ctx.font = `bold 20px ${this.config.fontFamily}`;
        ctx.fillStyle = this.config.colors.text;
        ctx.fillText(`${role(1)} COM：${score(1)}`, cx, cy - 35);

        // 餘牌
        ctx.font = `bold 24px ${this.config.fontFamily}`;
        ctx.fillStyle = this.config.colors.highlight;
        ctx.fillText(`余：${this.gameState.yama.length}`, cx, cy + 2);

        // Player
        ctx.font = `bold 20px ${this.config.fontFamily}`;
        ctx.fillStyle = this.config.colors.text;
        ctx.fillText(`${role(0)} 玩家：${score(0)}`, cx, cy + 40);

        // 分數變動箭頭提示
        this._drawScoreChangeIndicator(cx + 80, cy - 35, 1); // COM
        this._drawScoreChangeIndicator(cx + 80, cy + 40, 0); // Player
    }

    _drawScoreChangeIndicator(x, y, playerIdx) {
        const realScore = this.gameState.players[playerIdx].points;
        const visualScore = this.scoreState.display[playerIdx];
        
        if (Math.abs(realScore - visualScore) > 1) {
            this.ctx.fillStyle = this.config.colors.highlight;
            this.ctx.font = "bold 14px " + this.config.fontFamily;
            this.ctx.fillText(realScore > visualScore ? "↑" : "↓", x, y);
        }
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
        const startX = (this.ZONES.playerHand.x + 14 * (this.config.tile.w + this.config.tile.gap)) - totalW;
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
            this.drawTile(btnData.tileIcon, x + (w - 30)/2, drawY + (h - 42)/2, 30, 42);
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
        const { faceDown, highlight, selected, marked, rotate = 0 } = options;
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
        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;

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
            drawBorder(`rgba(255, 120, 150, ${0.5 + bounce / 10})`, 3);
        }

        ctx.restore(); // ★ 還原座標系 (旋轉結束)

        // 6. 繪製肉球標記 (確保永遠頭朝上，不受旋轉影響)
        if (marked) {
            this._drawPawMarker(x, y, w, h, rotate);
        }
    }

    _drawPawMarker(x, y, w, h, rotate) {
        const ctx = this.ctx;
        const bounce = Math.sin(Date.now() / 200) * 5;
        const visualH = (rotate !== 0) ? w : h; // 旋轉後的視覺高度
        const centerY = y + h / 2;
        
        const pawX = x + w / 2;
        const pawY = centerY - (visualH / 2) - 25 + bounce;

        ctx.save();
        ctx.fillStyle = "rgba(255, 120, 150, 0.9)";
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 4;

        ctx.beginPath();
        ctx.arc(pawX, pawY, 10, 0, Math.PI * 2); // 掌心
        ctx.fill();

        [[0, -11], [-8, -8], [8, -8]].forEach(([ox, oy]) => { // 手指
            ctx.beginPath();
            ctx.arc(pawX + ox, pawY + oy, 4, 0, Math.PI * 2);
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
