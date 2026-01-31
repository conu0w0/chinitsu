/**
 * renderer.js
 * 負責將 GameState 繪製到 Canvas 上
 */
import { ResultRenderer } from "./renderer/resultRenderer.js";

export class Renderer {
    constructor(canvas, gameState, assets = {}) {        
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;

        this.fontFamily = "'M PLUS Rounded 1c', 'Microsoft JhengHei', sans-serif";
        
        // UI 按鈕區域
        this.uiButtons = [];   
        this.animations = []; 
        
        this.lastHandLength = 0; 
        this.lastComHandLength = 0;

        // 設定解析度
        this.canvas.width = 1024;
        this.canvas.height = 1024;

        // === 參數設定 ===
        this.tileWidth = 48;  
        this.tileHeight = 76;
        this.tileGap = 2;
        this.drawGap = 20;

        this.riverTileWidth = 40; 
        this.riverTileHeight = 56;

        this.hoveredIndex = -1; 
        this.handYOffsets = new Array(14).fill(0);

        const infoBoxW = 260;
        const infoBoxH = 120;
        const infoBoxGap = 25;
        this.displayPoints = [this.gameState.players[0].points, this.gameState.players[1].points];

        const riverTotalWidth = (5 * this.riverTileWidth) + this.riverTileHeight;

        this.meldWidth = 36;  // 副露牌寬
        this.meldHeight = 56; // 副露牌高

        const W = this.canvas.width;
        const H = this.canvas.height;
        const CX = W / 2;
        const CY = H / 2;
        
        const riverX = CX - (riverTotalWidth / 2);
        const playerRiverY = CY + (infoBoxH / 2) + infoBoxGap - (0.2 * this.riverTileHeight);
        const comRiverY = CY - (infoBoxH / 2) - infoBoxGap - (0.8 * this.riverTileHeight);

        this.ZONES = {
            playerHand: { x: W * 0.15, y: H * 0.80 },
            playerRiver: { x: riverX, y: playerRiverY, cols: 6 },
            playerMeld: { x: W * 0.88, y: H * 0.80 + (76 - 56) }, 

            comHand: { x: W * 0.80, y: H * 0.15 },            
            comRiver: { x: riverX, y: comRiverY, cols: 6 },
            comMeld: { x: W * 0.15, y: H * 0.15 + (76 - 56) }
        };
        
        this.resultRenderer = new ResultRenderer(this);
    }

    /* ======================
       1. 主繪製循環
       ====================== */
    draw() {
    // 1. 邏輯更新 (即便結算也更新位移，讓牌不會瞬間「掉下來」)
    this._checkHandChanges();
    this._checkComHandChanges();
    this._updateDisplayPoints();

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._drawBackground();

    // 2. 繪製世界物件 (這部分包含手牌與牌河)
    this.drawInfo();
    this.drawRivers();
    this.drawHands(); // ★ 確保這裡沒有被 phase === "ROUND_END" 擋住

    // 3. 繪製動畫
    this._renderAnimations();

    // 4. 最上層覆蓋
    if (this.gameState.phase === "ROUND_END") {
        
        // 只有在階段 0 (還沒點擊清空) 時，才畫結算畫面
        if (this.gameState.resultClickStage === 0) {
            if (this.resultRenderer) {
                this.resultRenderer.draw(this.gameState.lastResult);
            }
        }
        
        // 階段 1 與 2 時，resultRenderer 不會被呼叫，畫面會變得很清空
        // 此時 drawInfo 會負責顯示「跳動中」或「結算完」的點數
        this.drawInfo(); 

    } else {
        // 一般遊戲狀態
        this.renderUI();
        this.drawInfo();
    }
}

    // === 偵測玩家手牌變化 ===
    _checkHandChanges() {
        const player = this.gameState.players[0];
        const currentLen = player.tepai.length;
        const validPhases = ["DEALING", "DRAW", "PLAYER_DECISION", "ROUND_END"];
        const isDealing = (this.gameState.phase === "DEALING"); // ★ 判斷是否發牌中

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastHandLength) {
            const diff = currentLen - this.lastHandLength;
            // 發牌階段不計算摸牌間隙，避免動畫跳動
            const isDrawState = !isDealing && (currentLen % 3 === 2);

            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastHandLength + i;
                if (this.animations.some(a => !a.isCom && a.index === tileIndex)) continue;
                
                const tileVal = player.tepai[tileIndex];                
                const zone = this.ZONES.playerHand;
                let targetX = zone.x + tileIndex * (this.tileWidth + this.tileGap);
                
                // 只有非發牌階段且是摸牌位，才加間隔
                if (isDrawState && tileIndex === currentLen - 1) {
                    targetX += this.drawGap;
                }

                this.animations.push({
                    type: "draw",
                    isCom: false,
                    tile: tileVal,
                    index: tileIndex,
                    x: targetX,
                    y: zone.y,
                    startX: targetX,
                    startY: zone.y - 150,
                    startTime: performance.now(),
                    duration: 400
                });
            }
        }
        this.lastHandLength = currentLen;
    }

    // === 偵測 COM 手牌變化 ===
    _checkComHandChanges() {
        const com = this.gameState.players[1];
        const currentLen = com.tepai.length;
        const validPhases = ["DEALING", "DRAW", "COM_DECISION", "ROUND_END"];
        const isDealing = (this.gameState.phase === "DEALING");

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastComHandLength) {
            const diff = currentLen - this.lastComHandLength;
            
            // 發牌階段忽略間隙
            const isDrawState = !isDealing && (currentLen % 3 === 2);
            
            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastComHandLength + i;
                if (this.animations.some(a => a.isCom && a.index === tileIndex)) continue;
                const zone = this.ZONES.comHand;
                const w = 48;

                let targetX = zone.x - tileIndex * (w + 2);
                
                // 鏡像邏輯：剛摸的那張牌放在最左邊
                if (isDrawState && tileIndex === currentLen - 1) {
                    targetX -= this.drawGap; 
                }

                this.animations.push({
                    type: "draw",
                    isCom: true,
                    tile: -1,
                    index: tileIndex,
                    x: targetX,
                    y: zone.y,
                    startX: targetX,
                    startY: zone.y + 150,
                    startTime: performance.now(),
                    duration: 400
                });
            }
        }
        this.lastComHandLength = currentLen;
    }

    _drawBackground() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (this.assets.table) {
        ctx.drawImage(this.assets.table, 0, 0, W, H);
    } else {
        // --- 1. 深色桌布漸層 (模擬聚光燈) ---
        const cx = W / 2;
        const cy = H / 2;
        const grad = ctx.createRadialGradient(cx, cy, 100, cx, cy, 700);
        grad.addColorStop(0, "#1e4d3e"); // 中心：較亮的墨綠
        grad.addColorStop(1, "#0a1a15"); // 邊緣：深沉的黑綠        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // --- 2. 邊緣外框 ---
        ctx.strokeStyle = "rgba(212, 175, 55, 0.4)"; // 帶透明度的金
        ctx.lineWidth = 15;
        ctx.strokeRect(0, 0, W, H);
    }
}

    getUIAction(x, y) {
        for (const btn of this.uiButtons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return btn.action;
            }
        }
        return null;
    }

    drawInfo() {
        const ctx = this.ctx;
        const state = this.gameState;
        
        // 1. 取得螢幕中心
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // 2. 定義資訊框大小
        const boxWidth = 260;
        const boxHeight = 120;
        const x = cx - boxWidth / 2;
        const y = cy - boxHeight / 2;

        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8; // 產生 0.6 ~ 1.0 的波動
        ctx.strokeStyle = `rgba(255, 204, 0, ${pulse * 0.4})`; // 山牌餘量警示色
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, boxWidth + 4, boxHeight + 4);

        // === 畫背景 (半透明黑底 + 細邊框) ===
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; 
        ctx.fillRect(x, y, boxWidth, boxHeight);
        
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, boxWidth, boxHeight);

        const parentIdx = state.parentIndex; 
        
        // 判斷親/子稱號
        const p0Role = (parentIdx === 0) ? "[親]" : "[子]"; // 玩家
        const p1Role = (parentIdx === 1) ? "[親]" : "[子]"; // COM

        // 取得分數
        const p0Score = state.players[0].points;
        const p1Score = state.players[1].points;
        const p0Display = Math.floor(this.displayPoints[0]);
        const p1Display = Math.floor(this.displayPoints[1]);
        
        // 取得餘牌
        const yamaCount = state.yama.length;

        // === 畫文字 (置中) ===
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 上行：COM 資訊
        ctx.font = `bold 20px ${this.fontFamily}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${p1Role} COM：${p1Display}`, cx, cy - 35);

        // 中行：餘牌 (黃色高亮)
        ctx.font = `bold 24px ${this.fontFamily}`;
        ctx.fillStyle = "#ffcc00"; 
        ctx.fillText(`余：${yamaCount}`, cx, cy + 2);

        // 下行：玩家資訊
        ctx.font = `bold 20px ${this.fontFamily}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${p0Role} 玩家：${p0Display}`, cx, cy + 40);

        // --- COM 的分數變動提示 ---
        if (Math.abs(state.players[1].points - this.displayPoints[1]) > 1) {
            ctx.fillStyle = "#ffcc00";
            ctx.font = "bold 14px " + this.fontFamily;
            ctx.fillText(state.players[1].points > this.displayPoints[1] ? "↑" : "↓", cx + 80, cy - 35);
        }
        
        // --- 玩家的分數變動提示 ---
        if (Math.abs(this.gameState.players[0].points - this.displayPoints[0]) > 1) {
            ctx.fillStyle = "#ffcc00";
            ctx.font = "bold 14px " + this.fontFamily;
            ctx.fillText(this.gameState.players[0].points > this.displayPoints[0] ? "↑" : "↓", cx + 80, cy + 40);
        }
        
    }

    /* ======================
       2. 手牌與副露繪製
       ====================== */
    drawHands() {
        this._drawPlayerHand();
        this._drawPlayerMelds();
        this._drawComHand();
        this._drawComMelds();
    }

    _drawPlayerHand() {
        const player = this.gameState.players[0];
        const zone = this.ZONES.playerHand;
        const globalFaceDown = player.handFaceDown; 
        
        // 發牌階段忽略間隙
        const isDealing = (this.gameState.phase === "DEALING");
        const isDrawState = !isDealing && (player.tepai.length % 3 === 2);

        player.tepai.forEach((tile, i) => {
            const isAnimating = this.animations.some(anim => !anim.isCom && anim.index === i);
            if (isAnimating) return;

            let x = zone.x + i * (this.tileWidth + this.tileGap);
            
            // 只有最後一張且是摸牌狀態才加空隙
            if (isDrawState && i === player.tepai.length - 1) x += this.drawGap;

            // 如果是被指著的牌，目標高度是 -16，否則是 0
            const targetOffset = (this.hoveredIndex === i) ? -16 : 0;
            // 簡單的線性插值，讓牌「升起」跟「降落」有過程感
            this.handYOffsets[i] = (this.handYOffsets[i] || 0) * 0.7 + targetOffset * 0.3;
            
            const drawY = zone.y + this.handYOffsets[i];
            
            this.drawTile(tile, x, drawY, this.tileWidth, this.tileHeight, { 
                faceDown: globalFaceDown,
                selected: (this.hoveredIndex === i)
            });
        });
    }

    _drawPlayerMelds() {
        const player = this.gameState.players[0];
        const melds = player.fulu;
        if (!melds || melds.length === 0) return;

        // 起始點：螢幕右側錨點
        let currentX = this.ZONES.playerMeld.x;
        const y = this.ZONES.playerMeld.y;

        // 遍歷副露 (順序：先槓的在最右邊)
        melds.forEach((meld) => {
            // 1. 先計算這個副露的總寬度 (不要畫，只算寬度)
            const width = this._calculateMeldWidth(meld, this.meldWidth);
            
            // 2. 因為是往左長，所以起點 x 要扣掉寬度
            const drawX = currentX - width;
            
            // 3. 畫在這個位置
            this._drawSingleMeld(meld, drawX, y, this.meldWidth, this.meldHeight);
            
            // 4. 更新下一個副露的起點 (再往左移，並加上一點間隙)
            currentX -= (width + 10);
        });
    }

    _drawComHand() {
        const com = this.gameState.players[1];
        const zone = this.ZONES.comHand;
        const w = 48; 
        const h = 76;

        const isDealing = (this.gameState.phase === "DEALING");
        const isDrawState = !isDealing && (com.tepai.length % 3 === 2);
        
        for (let i = 0; i < com.tepai.length; i++) {
            const isAnimating = this.animations.some(anim => anim.isCom && anim.index === i);
            if (isAnimating) continue;

            let x = zone.x - i * (w + 2);
            if (isDrawState && i === com.tepai.length - 1) {
                 x -= this.drawGap;
            }
            this.drawTile(-1, x, zone.y, w, h, { faceDown: true });
        }
    }

    // COM 副露
    _drawComMelds() {
        const com = this.gameState.players[1];
        const melds = com.fulu;
        if (!melds || melds.length === 0) return;

        // 起始點：螢幕左側錨點
        let currentX = this.ZONES.comMeld.x;
        const y = this.ZONES.comMeld.y;

        melds.forEach((meld) => {
            // 1. 直接從左邊開始畫
            const width = this._drawSingleMeld(meld, currentX, y, this.meldWidth, this.meldHeight);
            
            // 2. 更新下一個起點 (往右移)
            currentX += (width + 10);
        });
    }

    // 輔助：計算副露寬度 (不繪製)
    _calculateMeldWidth(meld, w) {
        if (meld.type === "ankan") {
            return 4 * (w + 2);
        } else {
            return 3 * (w + 2);
        }
    }

    // 繪製單個副露 (返回佔用的寬度)
    _drawSingleMeld(meld, x, y, w, h) {
        if (meld.type === "ankan") {
            for (let i = 0; i < 4; i++) {
                const faceDown = (i === 0 || i === 3);
                this.drawTile(meld.tile, x + i * (w + 2), y, w, h, { faceDown });
            }
            return 4 * (w + 2);
        } else {
            const count = 3; 
            for(let i=0; i<count; i++){
                this.drawTile(meld.tile, x + i * (w + 2), y, w, h);
            }
            return count * (w + 2);
        }
    }
    
    /* ======================
       3. 牌河繪製
       ====================== */
    drawRivers() {
        this._drawRiverGroup(this.gameState.players[0].river, this.ZONES.playerRiver, false);
        this._drawRiverGroup(this.gameState.players[1].river, this.ZONES.comRiver, true);
    }
    
    _drawRiverGroup(riverData, zone, isCom) {
        const w = this.riverTileWidth; 
        const h = this.riverTileHeight;
        
        // 用來記錄當前這一行，已經累積了多少 X 軸的偏移量
        let currentRowX = 0;
        let currentRow = 0;

        riverData.forEach((item, i) => {
            // === 1. 換行判斷 ===
            // 每 6 張牌換一行 (除了第 0 張)
            if (i > 0 && i % zone.cols === 0) {
                currentRow++;
                currentRowX = 0; // 換行後，X 偏移歸零
            }
            
            // === 2. 計算這張牌佔用的「視覺寬度」 ===
            const tileSpace = item.isRiichi ? h : w;

            // === 3. 計算繪圖座標 (DrawX) ===
            let drawX;
            
            if (isCom) {
                // COM 的牌河：從右向左排列
                const lineStartRight = zone.x + (zone.cols * w); 
                drawX = lineStartRight - currentRowX - tileSpace;
            } else {
                // 玩家 的牌河：從左向右排列
                drawX = zone.x + currentRowX;
            }

            // Y 軸位置 (加上立直的微調)
            let drawY = zone.y + currentRow * h;
            
            // 設定旋轉角度
            const rotate = item.isRiichi ? (isCom ? 90 : -90) : 0;

            if (rotate !== 0) {
                const offset = (h - w) / 2;
                drawX += offset;
                drawY += offset; 
            }

            // === 4. 繪製牌 ===
            const isLast = (this.gameState.lastDiscard &&
                            this.gameState.lastDiscard.fromPlayer === (isCom ? 1 : 0) &&
                            i === riverData.length - 1);

            this.drawTile(item.tile, drawX, drawY, w, h, { rotate, marked: isLast });

            // === 5. 為了「下一張牌」更新累積偏移量 ===
            currentRowX += tileSpace;
        });
    }

    /* ======================
       4. 單張牌繪製
       ====================== */
    drawTile(tileVal, x, y, w, h, options = {}) {
    const { faceDown = false, highlight = false, selected = false, marked = false, rotate = 0 } = options;
    const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];
    const ctx = this.ctx;

    ctx.save(); 

    // --- 1. 座標轉換 (包含牌面、框框) ---
    if (rotate !== 0) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    // --- 2. 繪製牌體 ---
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;

    if (img) {
        ctx.drawImage(img, x, y, w, h);
    } else {
        ctx.fillStyle = faceDown ? "#234" : "#f5f5f5";
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }

    ctx.shadowColor = "transparent";

    // --- 3. 繪製框框 (在旋轉的座標系內，所以會跟著轉) ---
    if (highlight) {
        ctx.strokeStyle = "#ff4444"; 
        ctx.lineWidth = 4;
        this._strokeRoundedRect(ctx, x, y, w, h, 5);
    }
    if (selected) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
        ctx.lineWidth = 4;
        this._strokeRoundedRect(ctx, x, y, w, h, 5);
    }
    if (marked) {
        // 這是牌面上的「呼吸紅框」，必須跟著牌轉
        const bounce = Math.sin(Date.now() / 200) * 5;
        ctx.strokeStyle = `rgba(255, 120, 150, ${0.5 + bounce / 10})`;
        ctx.lineWidth = 3;
        this._strokeRoundedRect(ctx, x, y, w, h, 5);
    }

    ctx.restore(); // ★ 座標系在此回正！

    // --- 4. 繪製肉球 (在回正後的座標系，永遠頭朝上) ---
    if (marked) {
        ctx.save();
        const bounce = Math.sin(Date.now() / 200) * 5;
        
        // 取得旋轉後的視覺高度
        // 如果轉 90/-90 度，視覺高度就是原本的寬度 (w)
        const visualHeight = (rotate !== 0) ? w : h;
        
        // 取得牌的視覺中心 Y
        const centerY = y + h / 2;
        
        // --- 核心修正點 ---
        // pawY = 中心點 - (視覺高度的一半) - (固定的安全距離) + 跳動
        // 這裡把安全距離從 15 加大到 25，確保不壓牌
        const pawY = centerY - (visualHeight / 2) - 25 + bounce;
        const pawX = x + w / 2;

        ctx.fillStyle = "rgba(255, 120, 150, 0.9)";
        ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
        ctx.shadowBlur = 4;
        
        // 畫肉球... (其餘代碼不變)
        ctx.beginPath();
        ctx.arc(pawX, pawY, 10, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(pawX - 8, pawY - 8, 4, 0, Math.PI * 2);
        ctx.arc(pawX, pawY - 11, 4, 0, Math.PI * 2);
        ctx.arc(pawX + 8, pawY - 8, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }
}

    /* ======================
       5. 動畫渲染
       ====================== */
    /**
 * 更新並繪製遊戲進行中的動畫（摸牌、切牌）
 */
_renderAnimations() {
    const now = performance.now();
    const { ctx, tileWidth, tileHeight } = this;

    // 只過濾並執行純粹的牌型位移動畫
    this.animations = this.animations.filter(anim => {
        const elapsed = now - anim.startTime;
        const progress = Math.min(elapsed / anim.duration, 1);
        
        // 使用簡單的 easeOutQuad 緩動
        const ease = progress * (2 - progress);

        // 計算當前座標
        const currentX = anim.startX + (anim.x - anim.startX) * ease;
        const currentY = anim.startY + (anim.y - anim.startY) * ease;

        ctx.save();
        // 如果是電腦摸牌，通常會畫背面
        const isFaceDown = anim.isCom && anim.type === "draw";
        
        this.drawTile(
            anim.tile, 
            currentX, 
            currentY, 
            tileWidth, 
            tileHeight, 
            { faceDown: isFaceDown }
        );
        ctx.restore();

        return progress < 1; // 動畫未完則保留
    });
}
    /* ======================
       6. UI
       ====================== */
    renderUI() {
        this.uiButtons = []; 
        const state = this.gameState;
        
        if (!this._isPlayerControllablePhase()) return;

        const actions = state.getLegalActions(0);
        const buttons = [];
        const handZone = this.ZONES.playerHand;
        
        const btnW = 100;
        const btnH = 50;
        const gap = 15;
        // 動態計算按鈕位置 (避開手牌)
        const anchorRight = handZone.x + 13 * (this.tileWidth + this.tileGap);
        const y = handZone.y - btnH - 25;

        if (state.phase === "PLAYER_DECISION") {
            if (actions.canAnkan) buttons.push({ text: "槓", action: { type: "TRY_ANKAN" } });
            if (actions.canRiichi) buttons.push({ text: "立直", action: { type: "RIICHI" } });
            if (actions.canTsumo) buttons.push({ text: "自摸", action: { type: "TSUMO" } });
            if (buttons.length > 0) buttons.push({ text: "跳過", action: { type: "CANCEL" } });
        }
        else if (state.phase === "ANKAN_SELECTION") {
            const player = state.players[0];
            const currentAnkanCount = player.fulu.filter(m => m.type === "ankan").length;
            const kanList = state.logic.getAnkanTiles(
                player.tepai, 
                currentAnkanCount,
                player.isReach ? player.riichiWaitSet : null
            );

            kanList.forEach(tile => {
                buttons.push({ 
                    text: "", 
                    tileIcon: tile, 
                    action: { type: "ANKAN", tile: tile } 
                });
            });
            buttons.push({ text: "返回", action: { type: "CANCEL" } });
        }
        else if (state.phase === "RIICHI_DECLARATION") {
            buttons.push({ text: "返回", action: { type: "CANCEL" } });
        }
        else if (state.phase === "REACTION_DECISION") {
            if (actions.canRon) buttons.push({ text: "榮和", action: { type: "RON" } });
            buttons.push({ text: "跳過", action: { type: "CANCEL" } });
        }

        if (buttons.length === 0) return;

        let x = anchorRight - btnW;
        for (let i = buttons.length - 1; i >= 0; i--) {
            const btn = buttons[i];
            this.drawUIButton(x, y, btnW, btnH, btn.text, btn.tileIcon);
            this.uiButtons.push({ x, y, w: btnW, h: btnH, action: btn.action });
            x -= (btnW + gap);
        }
    }

    _isPlayerControllablePhase() {
        const state = this.gameState;
        if (state.phase === "PLAYER_DECISION" && state.turn === 0) return true;
        if (state.phase === "ANKAN_SELECTION" && state.turn === 0) return true;
        if (state.phase === "RIICHI_DECLARATION") return true;
        if (state.phase === "REACTION_DECISION") {
            if (state.lastDiscard && state.lastDiscard.fromPlayer !== 0) return true;
        }
        return false;
    }

    drawUIButton(x, y, w, h, text, tileIcon = null) {
        const ctx = this.ctx;
        
        ctx.save();
        
        // 1. 繪製按鈕主體 - 帶有半透明感的磨砂玻璃        
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, "rgba(74, 120, 90, 0.8)"); // 竹葉綠 (頂部)
        gradient.addColorStop(1, "rgba(40, 70, 50, 0.9)");  // 深林綠 (底部)
        
        ctx.fillStyle = gradient;
        // 使用圓角矩形
        this._fillRoundedRect(ctx, x, y, w, h, 8);
        
        // 2. 增加白色內發光 (模擬玻璃邊緣質感)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 2;
        this._strokeRoundedRect(ctx, x, y, w, h, 8);
        
        // 3. 繪製內容
        if (tileIcon !== null && tileIcon !== undefined) {
            const tileW = 30;
            const tileH = 42;
            const tileX = x + (w - tileW) / 2;
            const tileY = y + (h - tileH) / 2;
            
            // 畫圖標前稍微加一點發光
            ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
            ctx.shadowBlur = 10;
            this.drawTile(tileIcon, tileX, tileY, tileW, tileH);
        } else {
            ctx.fillStyle = "#ffffff";
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 4;
            ctx.font = `bold 22px ${this.fontFamily}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, x + w / 2, y + h / 2);
        }
        
        ctx.restore();
    }
    
    // 輔助方法：圓角矩形
    _fillRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
    }
    
    _strokeRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.stroke();
    }
    
    _updateDisplayPoints() {
        this.gameState.players.forEach((p, i) => {
            const diff = p.points - this.displayPoints[i];
            if (Math.abs(diff) > 0.1) {
                // 每次靠近 10%，這樣數字增加時會有「先快後慢」的平滑感
                this.displayPoints[i] += diff * 0.1;
            } else {
                this.displayPoints[i] = p.points;
            }
        });
    }
}
