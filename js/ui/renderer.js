/**
 * renderer.js
 * 負責將 GameState 繪製到 Canvas 上
 */

export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;
        
        // UI 按鈕區域，供點擊偵測使用
        this.uiButtons = [];   

        // === 動畫系統 ===
        this.animations = []; // 存儲所有正在飛行的牌
        
        // 用來偵測手牌數量變化的變數
        this.lastHandLength = 0; 
        this.lastComHandLength = 0;

        // 設定內部解析度 (Retina 清晰度)
        this.canvas.width = 1024;
        this.canvas.height = 1024;

        // === 參數設定 ===
        this.tileWidth = 48;  
        this.tileHeight = 76;
        this.tileGap = 2;
        this.drawGap = 16;    // 摸牌與手牌的間距

        // === 版面配置 (ZONES) ===
        const W = this.canvas.width;
        const H = this.canvas.height;

        this.ZONES = {
            playerHand: { x: W * 0.10, y: H * 0.86 },
            playerRiver: { x: W * 0.31, y: H * 0.60, cols: 6 },
            comHand: { x: W * 0.10, y: H * 0.15 },            
            comRiver: { x: W * 0.31, y: H * 0.34, cols: 6 },
        }
    }

    /* ======================
       1. 主繪製循環
       ====================== */
    draw() {
        // 0. 偵測狀態變化 (自動觸發動畫)
        this._checkHandChanges();
        this._checkComHandChanges();

        // 1. 清除畫面
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. 繪製背景
        this._drawBackground();

        // 3. 繪製靜態組件 (手牌會避開正在飛行的牌)
        this.drawInfo();
        this.drawRivers();
        this.drawHands(); 
        
        // 4. 繪製動畫層 (飛行的牌)
        this._renderAnimations();
        
        // 5. 繪製 UI 層 (按鈕)
        this.renderUI();

        // 6. 繪製結算畫面 (若有)
        if (this.gameState.phase === "ROUND_END") {
            this.drawResult(this.gameState.lastResult);
        }
    }

    // === 核心：偵測玩家手牌變化 ===
    _checkHandChanges() {
        const player = this.gameState.players[0];
        const currentLen = player.tepai.length;
        // 只在這些階段觸發動畫，避免切牌或理牌時誤判
        const validPhases = ["DEALING", "DRAW", "PLAYER_DECISION"];

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastHandLength) {
            const diff = currentLen - this.lastHandLength;
            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastHandLength + i;
                const tileVal = player.tepai[tileIndex];
                
                // 計算目標位置
                const zone = this.ZONES.playerHand;
                let targetX = zone.x + tileIndex * (this.tileWidth + this.tileGap);
                if (tileIndex === 13) targetX += this.drawGap; // 第14張分開

                this.animations.push({
                    type: "draw",
                    isCom: false,     // 標記：玩家
                    tile: tileVal,
                    index: tileIndex, // 用於防鬼影
                    x: targetX,
                    y: zone.y,
                    startX: targetX,
                    startY: zone.y - 150, // 從上方滑入
                    startTime: performance.now(),
                    duration: 400
                });
            }
        }
        this.lastHandLength = currentLen;
    }

    // === 核心：偵測 COM 手牌變化 ===
    _checkComHandChanges() {
        const com = this.gameState.players[1];
        const currentLen = com.tepai.length;
        const validPhases = ["DEALING", "DRAW", "COM_DECISION"];

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastComHandLength) {
            const diff = currentLen - this.lastComHandLength;
            for (let i = 0; i < diff; i++) {
                const w = 48; // COM 牌寬
                const tileIndex = this.lastComHandLength + i;
                const zone = this.ZONES.comHand;
                let targetX = zone.x + tileIndex * (w + 2);

                this.animations.push({
                    type: "draw",
                    isCom: true,      // 標記：電腦
                    tile: -1,         // 背面
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
        this.lastComHandLength = currentLen;
    }

    // 內部：背景繪製
    _drawBackground() {
        if (this.assets.table) {
            this.ctx.drawImage(this.assets.table, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = "#1b4d3e"; 
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.strokeStyle = "#d4af37"; 
            this.ctx.lineWidth = 10;
            this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // 取得點擊位置對應的 UI Action
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
        
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        
        this.ctx.font = "bold 28px sans-serif";
        this.ctx.fillText(`余：${this.gameState.yama.length}`, 20, 160);

        ctx.font = "24px sans-serif";
        ctx.fillText(`玩 家：${state.players[0].points}`, 20, 210);
        ctx.fillText(`COM：${state.players[1].points}`, 20, 240);
    }

    /* ======================
       2. 手牌繪製
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
        const globalFaceDown = player.handFaceDown; // GameState 控制的整體蓋牌狀態

        player.tepai.forEach((tile, i) => {
            // 防鬼影：如果這張牌正在動畫中 (isCom: false)，跳過繪製
            const isAnimating = this.animations.some(anim => !anim.isCom && anim.index === i);
            if (isAnimating) return;

            let x = zone.x + i * (this.tileWidth + this.tileGap);
            
            // 只有在非配牌階段且是第14張才拉開距離
            if (this.gameState.phase !== "DEALING" && i === 13) {
                x += this.drawGap;
            }
            
            this.drawTile(tile, x, zone.y, this.tileWidth, this.tileHeight, { faceDown: globalFaceDown });
        });
    }

    _drawPlayerMelds() {
        const player = this.gameState.players[0];
        const melds = player.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.playerHand;
        
        // 1. 計算手牌佔用的寬度
        const handCount = player.tepai.length;
        let handWidth = handCount * (this.tileWidth + this.tileGap);
        // 如果手牌是 14 張(如剛摸牌還沒打)，要加上間距，避免副露疊在摸的那張牌上
        if (handCount === 14) handWidth += this.drawGap;

        // 2. 設定副露的起始位置 (接在手牌右側)
        let x = handZone.x + handWidth + 40; // +40 稍微拉開一點距離表示區隔
        const y = handZone.y; // 保持與手牌同高

        // 3. 繪製
        melds.forEach((meld) => {
            const widthUsed = this._drawSingleMeld(meld, x, y, false);
            x += widthUsed + 10; // 每個副露之間留點空隙
        });
    }

    _drawComHand() {
        const com = this.gameState.players[1];
        const zone = this.ZONES.comHand;
        const w = 48; 
        const h = 76;
        
        for (let i = 0; i < com.tepai.length; i++) {
            // 防鬼影：如果這張牌正在動畫中 (isCom: true)，跳過繪製
            const isAnimating = this.animations.some(anim => anim.isCom && anim.index === i);
            if (isAnimating) continue;

            let x = zone.x + i * (w + 2); 
            this.drawTile(-1, x, zone.y, w, h, { faceDown: true });
        }
    }

    _drawComMelds() {
        const com = this.gameState.players[1];
        const melds = com.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.comHand;
        const w = this.tileWidth;
        const h = this.tileHeight;
        
        // 1. 計算 COM 手牌寬度
        const handCount = com.tepai.length;
        const handWidth = handCount * (w + 2);

        // 2. 設定起始位置 (接在 COM 手牌右側)
        // 修正：原本往左畫(x-=...)會跑出螢幕，改成往右畫
        let x = handZone.x + handWidth + 20; 
        const y = handZone.y;

        // 3. 繪製
        melds.forEach((meld) => {
            const widthUsed = this._drawSingleMeld(meld, x, y, true, w, h);
            x += widthUsed + 10; 
        });
    }

    // 專門處理暗槓的繪製
    _drawSingleMeld(meld, x, y, isSmall = false, w = null, h = null) {
        // 如果沒有指定尺寸，使用預設(玩家尺寸)
        if (!w) w = this.tileWidth;
        if (!h) h = this.tileHeight;
       
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
        const w = 40; 
        const h = 56;
        
        riverData.forEach((item, i) => {
            const col = i % zone.cols;
            const row = Math.floor(i / zone.cols);
            
            const x = isCom 
                ? zone.x + (zone.cols - 1 - col) * w 
                : zone.x + col * w;
                
            const y = zone.y + row * h; 
            
            const isLast = (this.gameState.lastDiscard &&
                            this.gameState.lastDiscard.fromPlayer === (isCom ? 1 : 0) &&
                            i === riverData.length - 1);
            
            const rotate = item.isRiichi ? (isCom ? -90 : 90) : 0;
            
            let drawX = x;
            let drawY = y;
            if (rotate !== 0) drawY += 10; 

            this.drawTile(item.tile, drawX, drawY, w, h, { rotate, highlight: isLast });
        });
    }

    /* ======================
       4. 單張牌繪製 (核心)
       ====================== */
    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown = false, highlight = false, rotate = 0 } = options;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];
        const ctx = this.ctx;

        ctx.save();

        if (rotate !== 0) {
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((rotate * Math.PI) / 180);
            ctx.translate(-(x + w / 2), -(y + h / 2));
        }

        if (img) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            // Fallback 繪製
            ctx.fillStyle = faceDown ? "#234" : "#f5f5f5";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#333";
            ctx.strokeRect(x, y, w, h);
            
            if (!faceDown) {
                ctx.fillStyle = "#000";
                ctx.font = "20px sans-serif";
                ctx.fillText(tileVal, x + 10, y + 40);
            }
        }

        if (highlight) {
            ctx.strokeStyle = "#ff4444"; 
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
        }

        ctx.restore();
    }

    /* ======================
       5. 動畫渲染邏輯
       ====================== */
    _renderAnimations() {
        const now = performance.now();
        const ctx = this.ctx;

        // 遍歷並過濾已結束的動畫
        this.animations = this.animations.filter(anim => {
            const t = Math.min((now - anim.startTime) / anim.duration, 1);
            const ease = 1 - Math.pow(1 - t, 3); // Ease-out

            const currentY = anim.startY + (anim.y - anim.startY) * ease;
            const currentX = anim.startX + (anim.x - anim.startX) * ease;

            ctx.save();
            
            // COM 永遠是背面，玩家永遠是正面 (滑落過程中)
            const shouldFaceDown = anim.isCom;
            
            const w = this.tileWidth;
            const h = this.tileHeight;

            this.drawTile(anim.tile, currentX, currentY, w, h, { faceDown: shouldFaceDown });
            ctx.restore();

            return t < 1; // 如果動畫未完成，保留在陣列中
        });
    }

    /* ======================
       6. UI 按鈕系統
       ====================== */
    renderUI() {
        this.uiButtons = []; 
        const state = this.gameState;
        
        if (!this._isPlayerControllablePhase()) return;

        const actions = state.getLegalActions(0);
        const buttons = [];
        const handZone = this.ZONES.playerHand;
        
        // 按鈕列配置
        const btnW = 100;
        const btnH = 50;
        const gap = 15;
        const anchorRight = handZone.x + 13 * (this.tileWidth + this.tileGap);
        const y = handZone.y - btnH - 20;

        // === 6.1 主決策層 ===
        if (state.phase === "PLAYER_DECISION") {
            if (actions.canAnkan) buttons.push({ text: "槓", action: { type: "TRY_ANKAN" } });
            if (actions.canRiichi) buttons.push({ text: "立直", action: { type: "RIICHI" } });
            if (actions.canTsumo) buttons.push({ text: "自摸", action: { type: "TSUMO" } });
            
            if (buttons.length > 0) buttons.push({ text: "跳過", action: { type: "CANCEL" } });
        }
        
        // === 6.2 槓牌選擇層 ===
        else if (state.phase === "ANKAN_SELECTION") {
            const player = state.players[0];
            const currentAnkanCount = player.fulu.filter(m => m.type === "ankan").length;
            
            // 取得可暗槓的列表
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
        
        // === 6.3 立直宣告層 ===
        else if (state.phase === "RIICHI_DECLARATION") {
            buttons.push({ text: "返回", action: { type: "CANCEL" } });
        }
        
        // === 6.4 榮和回應層 ===
        else if (state.phase === "REACTION_DECISION") {
            if (actions.canRon) buttons.push({ text: "榮和", action: { type: "RON" } });
            buttons.push({ text: "跳過", action: { type: "CANCEL" } });
        }

        if (buttons.length === 0) return;

        // 繪製按鈕 (從右往左排列)
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

        // 背景漸層
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, "#4a4a4a");
        gradient.addColorStop(1, "#2b2b2b");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);

        // 邊框
        ctx.strokeStyle = "#a0a0a0";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // 內容
        if (tileIcon !== null && tileIcon !== undefined) {
            const tileW = 30; 
            const tileH = 42;
            const tileX = x + (w - tileW) / 2;
            const tileY = y + (h - tileH) / 2;
            
            this.drawTile(tileIcon, tileX, tileY, tileW, tileH);
        } else {
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, x + w / 2, y + h / 2);
        }
    }

    /* ======================
       7. 結算畫面
       ====================== */
    drawResult(result) {
        if (!result) return;
        
        // 遮罩
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = "center";

        // === 7.1 犯規 (Chombo) ===
        if (result.type === "chombo") {
            this.ctx.fillStyle = "#ff6666";
            this.ctx.font = "bold 56px sans-serif";
            this.ctx.fillText("犯規", 512, 360);

            this.ctx.font = "36px sans-serif";
            const roleText = result.isParent ? "親" : "子";
            this.ctx.fillText(`${roleText} 罰符 ${result.score.total} 點`, 512, 440);
        } 
        
        // === 7.2 流局 (Ryuukyoku) ===
        else if (result.type === "ryuukyoku") {
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 64px sans-serif";
            this.ctx.fillText("流局", 512, 400);

            this.ctx.font = "28px sans-serif";
            this.ctx.fillStyle = "#cccccc";
            this.ctx.fillText("本局無人和牌", 512, 470);
        } 
        
        // === 7.3 和了 (Agari) ===
        else {
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 60px sans-serif";
            let title = "對局終了";
            if (result.score && result.score.yakumanRank > 0) title = "役滿！";
            this.ctx.fillText(title, 512, 300);

            if (result.score) {
                // 飜數/符數
                this.ctx.font = "40px sans-serif";
                this.ctx.fillStyle = "#ffcc00";
                const detail = result.score.display || `${result.best.han}飜 ${result.fu}符`;
                this.ctx.fillText(detail, 512, 400);

                // 分數
                const roleText = result.isParent ? "親" : "子";
                const winText = result.winType === "tsumo" ? "自摸" : "榮和";
                this.ctx.fillStyle = "#ffffff";
                this.ctx.font = "30px sans-serif";
                this.ctx.fillText(`${roleText} ${winText} ${result.score.total} 點`, 512, 480);
                
                // 役種列表
                if (result.score.yakus && result.score.yakus.length > 0) {
                    let y = 550;
                    this.ctx.font = "24px sans-serif";
                    result.score.yakus.forEach(yaku => {
                        this.ctx.fillText(yaku, 512, y);
                        y += 35;
                    });
                }
            }
        }
        
        // 重新開始提示
        this.ctx.font = "20px sans-serif";
        this.ctx.fillStyle = "#aaa";
        this.ctx.fillText("點擊任意處重新開始", 512, 800);
    }
}
