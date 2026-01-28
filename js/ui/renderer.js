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

        const infoBoxW = 260;
        const infoBoxH = 120;
        const infoBoxGap = 25;

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

            comHand: { x: W * 0.82, y: H * 0.15 },            
            comRiver: { x: riverX, y: comRiverY, cols: 6 },
            comMeld: { x: W * 0.05, y: H * 0.15 + (76 - 56) }
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

    // === 偵測玩家手牌變化 ===
    _checkHandChanges() {
        const player = this.gameState.players[0];
        const currentLen = player.tepai.length;
        const validPhases = ["DEALING", "DRAW", "PLAYER_DECISION"];
        const isDealing = (this.gameState.phase === "DEALING"); // ★ 判斷是否發牌中

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastHandLength) {
            const diff = currentLen - this.lastHandLength;
            // 發牌階段不計算摸牌間隙，避免動畫跳動
            const isDrawState = !isDealing && (currentLen % 3 === 2);

            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastHandLength + i;
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
        const validPhases = ["DEALING", "DRAW", "COM_DECISION"];
        const isDealing = (this.gameState.phase === "DEALING");

        if (validPhases.includes(this.gameState.phase) && currentLen > this.lastComHandLength) {
            const diff = currentLen - this.lastComHandLength;
            
            // 發牌階段忽略間隙
            const isDrawState = !isDealing && (currentLen % 3 === 2);
            
            for (let i = 0; i < diff; i++) {
                const tileIndex = this.lastComHandLength + i;
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
        
        // 1. 取得螢幕中心
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;

        // 2. 定義資訊框大小
        const boxWidth = 260;
        const boxHeight = 120;
        const x = cx - boxWidth / 2;
        const y = cy - boxHeight / 2;

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
        
        // 取得餘牌
        const yamaCount = state.yama.length;

        // === 畫文字 (置中) ===
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 上行：COM 資訊
        ctx.font = "bold 20px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${p1Role} COM：${p1Score}`, cx, cy - 35);

        // 中行：餘牌 (黃色高亮)
        ctx.font = "bold 24px sans-serif";
        ctx.fillStyle = "#ffcc00"; 
        ctx.fillText(`余：${yamaCount} 張`, cx, cy + 2);

        // 下行：玩家資訊
        ctx.font = "bold 20px sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${p0Role} 玩家：${p0Score}`, cx, cy + 40);
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
        
        // ★ FIX: 發牌階段忽略間隙
        const isDealing = (this.gameState.phase === "DEALING");
        const isDrawState = !isDealing && (player.tepai.length % 3 === 2);

        player.tepai.forEach((tile, i) => {
            const isAnimating = this.animations.some(anim => !anim.isCom && anim.index === i);
            if (isAnimating) return;

            let x = zone.x + i * (this.tileWidth + this.tileGap);
            
            // 只有最後一張且是摸牌狀態才加空隙
            if (isDrawState && i === player.tepai.length - 1) {
                x += this.drawGap;
            }
            
            this.drawTile(tile, x, zone.y, this.tileWidth, this.tileHeight, { faceDown: globalFaceDown });
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

            this.drawTile(item.tile, drawX, drawY, w, h, { rotate, highlight: isLast });

            // === 5. 為了「下一張牌」更新累積偏移量 ===
            currentRowX += tileSpace;
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
        // 動態計算按鈕位置 (避開手牌)
        const anchorRight = handZone.x + 13 * (this.tileWidth + this.tileGap);
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
