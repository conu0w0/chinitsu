/**
 * renderer.js
 * 負責將 GameState 繪製到 Canvas 上 (Updated: Mirror Fix & Kan Gap)
 */

export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;
        
        // UI 按鈕區域
        this.uiButtons = [];   
        this.animations = []; 
        
        this.lastHandLength = 0; 
        this.lastComHandLength = 0;

        this.canvas.width = 1024;
        this.canvas.height = 1024;

        this.tileWidth = 48;  
        this.tileHeight = 76;
        this.tileGap = 2;
        this.drawGap = 20;    // 摸牌與手牌的間距 (加大一點更明顯)

        // 副露的小尺寸
        this.meldWidth = 36;
        this.meldHeight = 56;

        const W = this.canvas.width;
        const H = this.canvas.height;

        this.ZONES = {
            playerHand: { x: W * 0.10, y: H * 0.86 },
            playerRiver: { x: W * 0.31, y: H * 0.60, cols: 6 },
            // COM 手牌起始點稍微往右移一點，留空間給鏡像的摸牌
            comHand: { x: W * 0.15, y: H * 0.15 },            
            comRiver: { x: W * 0.31, y: H * 0.34, cols: 6 },
        }
    }

    /* ======================
       1. 主繪製循環
       ====================== */
    draw() {
        this._checkHandChanges();
        this._checkComHandChanges();

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this._drawBackground();

        this.drawInfo();
        this.drawRivers();
        this.drawHands(); 
        
        this._renderAnimations();
        this.renderUI();

        if (this.gameState.phase === "ROUND_END") {
            this.drawResult(this.gameState.lastResult);
        }
    }

    // === 修正：偵測玩家手牌變化 ===
    _checkHandChanges() {
        const player = this.gameState.players[0];
        const currentLen = player.tepai.length;
        const validPhases = ["DEALING", "DRAW", "PLAYER_DECISION"];

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastHandLength) {
            const diff = currentLen - this.lastHandLength;
            // 判斷是否為摸牌狀態 (張數餘 2)
            const isDrawState = (currentLen % 3 === 2);

            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastHandLength + i;
                const tileVal = player.tepai[tileIndex];
                
                const zone = this.ZONES.playerHand;
                let targetX = zone.x + tileIndex * (this.tileWidth + this.tileGap);
                
                // ★ FIX: 只要是最後一張且處於摸牌狀態，就加上間隔 (支援槓後摸牌)
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

    // === ★ FIX: 偵測 COM 手牌變化 (鏡像邏輯) ===
    _checkComHandChanges() {
        const com = this.gameState.players[1];
        const currentLen = com.tepai.length;
        const validPhases = ["DEALING", "DRAW", "COM_DECISION"];

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastComHandLength) {
            const diff = currentLen - this.lastComHandLength;
            const isDrawState = (currentLen % 3 === 2);
            
            // 計算 COM 手牌整體位移 (為了留出左邊的摸牌空位)
            // 如果是摸牌狀態，手牌本體(index 0~N-2)要往右推一個 drawGap
            const bodyOffsetX = this.drawGap + this.tileWidth;

            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastComHandLength + i;
                const zone = this.ZONES.comHand;
                const w = 48;

                let targetX;
                
                // ★ 鏡像邏輯：如果是剛摸的那張牌 (最後一張)，放在最左邊
                if (isDrawState && tileIndex === currentLen - 1) {
                    targetX = zone.x - (w + this.drawGap); // 放在左側
                } else {
                    // 其他牌正常排列
                    targetX = zone.x + tileIndex * (w + 2);
                }

                this.animations.push({
                    type: "draw",
                    isCom: true,
                    tile: -1,
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
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.font = "bold 28px sans-serif";
        ctx.fillText(`余：${this.gameState.yama.length}`, 20, 160);

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
        const globalFaceDown = player.handFaceDown; 
        
        // ★ FIX: 通用的「摸牌狀態」判斷：長度餘 2
        const isDrawState = (player.tepai.length % 3 === 2);

        player.tepai.forEach((tile, i) => {
            const isAnimating = this.animations.some(anim => !anim.isCom && anim.index === i);
            if (isAnimating) return;

            let x = zone.x + i * (this.tileWidth + this.tileGap);
            
            // ★ FIX: 只要是最後一張且是摸牌狀態，就加上間隔
            if (this.gameState.phase !== "DEALING" && isDrawState && i === player.tepai.length - 1) {
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
        
        // 計算手牌寬度 (包含摸牌間隔)
        const handCount = player.tepai.length;
        const isDrawState = (handCount % 3 === 2);
        let handWidth = handCount * (this.tileWidth + this.tileGap);
        if (isDrawState) handWidth += this.drawGap;

        let x = handZone.x + handWidth + 40; 
        const y = handZone.y + (this.tileHeight - this.meldHeight); // 底部對齊

        melds.forEach((meld) => {
            // ★ FIX: 傳入較小的尺寸
            const widthUsed = this._drawSingleMeld(meld, x, y, this.meldWidth, this.meldHeight);
            x += widthUsed + 10; 
        });
    }

    _drawComHand() {
        const com = this.gameState.players[1];
        const zone = this.ZONES.comHand;
        const w = 48; 
        const h = 76;
        
        // ★ FIX: 鏡像邏輯
        const isDrawState = (com.tepai.length % 3 === 2);
        
        for (let i = 0; i < com.tepai.length; i++) {
            const isAnimating = this.animations.some(anim => anim.isCom && anim.index === i);
            if (isAnimating) continue;

            let x;
            
            // 如果是摸牌狀態，且這是最後一張牌 -> 畫在最左邊 (鏡像的右手)
            if (isDrawState && i === com.tepai.length - 1) {
                 x = zone.x - (w + this.drawGap);
            } else {
                 // 其他牌畫在基準點右邊
                 x = zone.x + i * (w + 2);
            }
            
            this.drawTile(-1, x, zone.y, w, h, { faceDown: true });
        }
    }

    _drawComMelds() {
        const com = this.gameState.players[1];
        const melds = com.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.comHand;
        
        // 計算起始位置 (接在 COM 手牌右側)
        const handCount = com.tepai.length;
        // 注意：雖然最後一張牌畫在左邊，但邏輯上手牌佔用的「右邊界」還是由最右邊的牌決定
        // 手牌通常索引是 0~(N-2)，N-1在左邊。所以右邊界是由 (N-2) 決定的。
        // 為了簡單起見，我們還是用總張數算寬度，視覺上比較整齊。
        
        // 修正：因為 COM 摸牌畫在左邊了，右邊不會有「凸出去」的一張，所以寬度比較緊湊
        let effectiveCount = isDrawState(com) ? handCount - 1 : handCount;
        let handWidth = effectiveCount * (this.tileWidth + 2);
        
        let x = handZone.x + handWidth + 40; 
        const y = handZone.y + (this.tileHeight - this.meldHeight); // 底部對齊

        melds.forEach((meld) => {
            // ★ FIX: 傳入較小的尺寸
            const widthUsed = this._drawSingleMeld(meld, x, y, this.meldWidth, this.meldHeight);
            x += widthUsed + 10; 
        });
        
        function isDrawState(p) { return p.tepai.length % 3 === 2; }
    }

    // ★ FIX: 支援傳入 w, h
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
       4. 單張牌繪製
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
            // Fallback
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
       5. 動畫渲染
       ====================== */
    _renderAnimations() {
        const now = performance.now();
        const ctx = this.ctx;

        this.animations = this.animations.filter(anim => {
            const t = Math.min((now - anim.startTime) / anim.duration, 1);
            const ease = 1 - Math.pow(1 - t, 3); 

            const currentY = anim.startY + (anim.y - anim.startY) * ease;
            const currentX = anim.startX + (anim.x - anim.startX) * ease;

            ctx.save();
            const shouldFaceDown = anim.isCom;
            const w = this.tileWidth;
            const h = this.tileHeight;

            this.drawTile(anim.tile, currentX, currentY, w, h, { faceDown: shouldFaceDown });
            ctx.restore();

            return t < 1;
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
        // 計算按鈕列的右邊界，根據手牌位置動態調整
        const anchorRight = handZone.x + 14 * (this.tileWidth + this.tileGap);
        const y = handZone.y - btnH - 20;

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
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, "#4a4a4a");
        gradient.addColorStop(1, "#2b2b2b");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = "#a0a0a0";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

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
        
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.textAlign = "center";

        if (result.type === "chombo") {
            this.ctx.fillStyle = "#ff6666";
            this.ctx.font = "bold 56px sans-serif";
            this.ctx.fillText("犯規", 512, 360);
            this.ctx.font = "36px sans-serif";
            const roleText = result.isParent ? "親" : "子";
            this.ctx.fillText(`${roleText} 罰符 ${result.score.total} 點`, 512, 440);
        } 
        else if (result.type === "ryuukyoku") {
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 64px sans-serif";
            this.ctx.fillText("流局", 512, 400);
            this.ctx.font = "28px sans-serif";
            this.ctx.fillStyle = "#cccccc";
            this.ctx.fillText("本局無人和牌", 512, 470);
        } 
        else {
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 60px sans-serif";
            let title = "對局終了";
            if (result.score && result.score.yakumanRank > 0) title = "役滿！";
            this.ctx.fillText(title, 512, 300);

            if (result.score) {
                this.ctx.font = "40px sans-serif";
                this.ctx.fillStyle = "#ffcc00";
                const detail = result.score.display || `${result.best.han}飜 ${result.fu}符`;
                this.ctx.fillText(detail, 512, 400);

                const roleText = result.isParent ? "親" : "子";
                const winText = result.winType === "tsumo" ? "自摸" : "榮和";
                this.ctx.fillStyle = "#ffffff";
                this.ctx.font = "30px sans-serif";
                this.ctx.fillText(`${roleText} ${winText} ${result.score.total} 點`, 512, 480);
                
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
        this.ctx.font = "20px sans-serif";
        this.ctx.fillStyle = "#aaa";
        this.ctx.fillText("點擊任意處重新開始", 512, 800);
    }
}
