/**
 * renderer.js
 * 負責將 GameState 繪製到 Canvas 上
 * 包含：手牌、牌河、副露、以及分層式的 UI 按鈕
 */

export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;
        
        // 存儲按鈕區域，供點擊偵測使用
        this.uiButtons = [];   
        this.drawAnimation = null;

        // 設定內部解析度為 1024x1024 (高解析度)
        this.canvas.width = 1024;
        this.canvas.height = 1024;

        // === 參數設定 ===
        this.tileWidth = 56;  
        this.tileHeight = 84;
        this.tileGap = 2;
        this.drawGap = 20;    // 摸牌與手牌的間距

        // === 版面配置 (ZONES) ===
        this.ZONES = {
            // 玩家手牌 (貼近底部)
            playerHand: { x: 110, y: 900 },

            // 玩家牌河 (中間偏下)
            playerRiver: { x: 340, y: 600, cols: 6 },

            // 對手牌河 (中間偏上)
            comRiver: { x: 340, y: 300, cols: 6 },

            // 對手手牌 (貼近頂部)
            opponentHand: { x: 110, y: 50 }
        };
        this.hasPlayedDrawAnimation = false;
    }

    /* ======================
       1. 主繪製循環
       ====================== */
    draw() {
        // 清除畫面
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製背景
        this._drawBackground();

        // 繪製各個遊戲組件
        this.drawInfo();
        this.drawRivers();
        this.drawHands(); // 包含手牌與副露
        
        // 繪製動畫層 (摸牌動畫)
        this.drawDrawAnimation();
        
        // 繪製 UI 層 (按鈕)
        this.renderUI();

        // 繪製結算畫面 (若有)
        if (this.gameState.phase === "ROUND_END") {
            this.drawResult(this.gameState.lastResult);
        }
    }

    // 內部：背景繪製
    _drawBackground() {
        if (this.assets.table) {
            this.ctx.drawImage(this.assets.table, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // 預設綠色桌布
            this.ctx.fillStyle = "#1b4d3e"; 
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.strokeStyle = "#d4af37"; 
            this.ctx.lineWidth = 10;
            this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    // 取得點擊位置對應的 UI Action (給 main.js 用)
    getUIAction(x, y) {
        // x, y 必須是相對於 canvas 1024x1024 的座標
        for (const btn of this.uiButtons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return btn.action;
            }
        }
        return null;
    }

    drawInfo() {
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        this.ctx.font = "bold 28px sans-serif";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        
        // 顯示剩餘張數
        this.ctx.fillText(`殘: ${this.gameState.yama.length}`, 20, 160);
    }

    /* ======================
       2. 手牌與副露繪製
       ====================== */
    drawHands() {
        this._drawPlayerHand();
        this._drawPlayerMelds();
        this._drawOpponentHand();
        this._drawOpponentMelds();
    }

    _drawPlayerHand() {
        const player = this.gameState.players[0];
        const zone = this.ZONES.playerHand;
        
        // 判斷是否為「摸牌狀態」(張數 3n+2)
        const isTsumoState = (player.tepai.length % 3 === 2);
        const lastIndex = player.tepai.length - 1;

        player.tepai.forEach((tile, i) => {
            let x = zone.x + i * (this.tileWidth + this.tileGap);
            
            // 如果是剛摸到的那張牌，拉開一點距離
            if (isTsumoState && i === lastIndex) {
                x += this.drawGap;

                // 觸發摸牌動畫 (只觸發一次，避免重複設定)
                if (!this.hasPlayedDrawAnimation) {
                    this.startDrawAnimation(tile, x, zone.y);
                    this.hasPlayedDrawAnimation = true;
                    return; // 動畫中先不畫這張靜態牌
                }
            }
            this.drawTile(tile, x, zone.y, this.tileWidth, this.tileHeight);
        });
    }

    _drawPlayerMelds() {
        const player = this.gameState.players[0];
        const melds = player.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.playerHand;
        
        // 計算手牌佔用的寬度，以便把副露畫在手牌右邊
        const handCount = player.tepai.length;
        const isTsumoState = (handCount % 3 === 2);
        const handWidth = handCount * (this.tileWidth + this.tileGap) + (isTsumoState ? this.drawGap : 0);

        // 副露起始位置
        let x = handZone.x + handWidth + 40;
        const y = handZone.y + (this.tileHeight - 60); // 稍微對齊底部

        melds.forEach((meld) => {
            const widthUsed = this._drawSingleMeld(meld, x, handZone.y, false);
            x += widthUsed + 10; 
        });
    }

    _drawOpponentHand() {
        const com = this.gameState.players[1];
        const zone = this.ZONES.opponentHand;
        
        const w = 40; // 縮小版
        const h = 60;
        
        for (let i = 0; i < com.tepai.length; i++) {
            let x = zone.x + i * (w + 2); 
            this.drawTile(-1, x, zone.y, w, h, { faceDown: true });
        }
    }

    _drawOpponentMelds() {
        const com = this.gameState.players[1];
        const melds = com.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.opponentHand;
        const w = 40;
        
        // 對手副露畫在手牌左邊
        let x = handZone.x - 20; 
        const y = handZone.y;

        melds.forEach((meld) => {
            // 先計算寬度以便往左推
            const tileCount = (meld.type === "ankan" || meld.type === "minkan") ? 4 : 3;
            const totalW = tileCount * w + (tileCount * 2);

            x -= totalW;
            this._drawSingleMeld(meld, x, y, true, w, 60);
            x -= 10; 
        });
    }

    // 通用副露繪製器
    _drawSingleMeld(meld, x, y, isSmall = false, w = null, h = null) {
        if (!w) w = this.tileWidth;
        if (!h) h = this.tileHeight;
        
        // 暗槓
        if (meld.type === "ankan") {
            for (let i = 0; i < 4; i++) {
                const faceDown = (i === 0 || i === 3);
                this.drawTile(meld.tile, x + i * (w + 2), y, w, h, { faceDown });
            }
            return 4 * (w + 2);
        } 
        // 其他 (吃、碰、明槓)
        else {
            const count = (meld.type === "minkan") ? 4 : 3;
            const tilesToDraw = meld.tiles || Array(count).fill(meld.tile);
            
            tilesToDraw.forEach((t, i) => {
                this.drawTile(t, x + i * (w + 2), y, w, h);
            });
            return count * (w + 2);
        }
    }
    
    /* ======================
       3. 牌河 (River)
       ====================== */
    drawRivers() {
        this._drawRiverGroup(this.gameState.players[0].river, this.ZONES.playerRiver, false);
        this._drawRiverGroup(this.gameState.players[1].river, this.ZONES.comRiver, true);
    }
    
    _drawRiverGroup(riverData, zone, isOpponent) {
        const w = 40; 
        const h = 56;
        
        riverData.forEach((item, i) => {
            const col = i % zone.cols;
            const row = Math.floor(i / zone.cols);
            
            // 玩家從左到右，對手從右到左
            const x = isOpponent 
                ? zone.x + (zone.cols - 1 - col) * w 
                : zone.x + col * w;
                
            const y = zone.y + row * h; 
            
            const isLast = (this.gameState.lastDiscard &&
                            this.gameState.lastDiscard.fromPlayer === (isOpponent ? 1 : 0) &&
                            i === riverData.length - 1);
            
            const rotate = item.isRiichi ? (isOpponent ? -90 : 90) : 0;
            
            // 立直牌位置微調
            let drawX = x;
            let drawY = y;
            if (rotate !== 0) {
                drawY += 10; 
            }

            this.drawTile(item.tile, drawX, drawY, w, h, { rotate, highlight: isLast });
        });
    }

    /* ======================
       4. 單張牌繪製核心
       ====================== */
    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown = false, highlight = false, rotate = 0 } = options;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];
        const ctx = this.ctx;

        ctx.save();

        // 處理旋轉
        if (rotate !== 0) {
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((rotate * Math.PI) / 180);
            ctx.translate(-(x + w / 2), -(y + h / 2));
        }

        if (img) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            // Fallback: 畫一個像牌的矩形
            ctx.fillStyle = faceDown ? "#234" : "#f5f5f5";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#333";
            ctx.strokeRect(x, y, w, h);
            
            if (!faceDown) {
                // 畫數字
                ctx.fillStyle = "#000";
                ctx.font = "20px sans-serif";
                ctx.fillText(tileVal, x + 10, y + 40);
            }
        }

        // 高亮 (最後打出的牌)
        if (highlight) {
            ctx.strokeStyle = "#ff4444"; 
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, w, h);
        }

        ctx.restore();
    }

    /* ======================
       5. 動畫效果
       ====================== */
    drawDrawAnimation() {
        if (!this.drawAnimation) return;

        const ctx = this.ctx;
        const now = performance.now();
        const anim = this.drawAnimation;

        const t = Math.min((now - anim.startTime) / anim.duration, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        const currentY = anim.startY + (anim.y - anim.startY) * ease;
        
        ctx.save();
        this.drawTile(anim.tile, anim.x, currentY, this.tileWidth, this.tileHeight);
        ctx.restore();

        if (t >= 1) {
            this.drawAnimation = null;
        }
    }

    /* ======================
       6. UI 按鈕渲染 (重點：分層邏輯)
       ====================== */
    renderUI() {
        this.uiButtons = []; // 清空上一幀

        const state = this.gameState;
        
        // 檢查權限
        if (!this._isPlayerControllablePhase()) return;

        const actions = state.getLegalActions(0);
        if (!actions) return;

        const buttons = [];
        const handZone = this.ZONES.playerHand;
        
        // 按鈕列設定
        const btnW = 100;
        const btnH = 50;
        const gap = 15;
        const anchorRight = handZone.x + 13 * (this.tileWidth + this.tileGap);
        const y = handZone.y - btnH - 20;

        // === 6.1 Root 層：PLAYER_DECISION ===
        if (state.phase === "PLAYER_DECISION") {
            
            // 槓按鈕 (TRY_ANKAN) - 進入選擇或直接槓
            if (actions.canAnkan) {
                buttons.push({ text: "槓", action: { type: "TRY_ANKAN" } });
            }

            // 立直按鈕 (RIICHI) - 進入確認層
            if (actions.canRiichi) {
                buttons.push({ text: "立直", action: { type: "RIICHI" } });
            }

            // 自摸按鈕 (TSUMO)
            if (actions.canTsumo) {
                buttons.push({ text: "自摸", action: { type: "TSUMO" } });
            }

            // Root 層的取消 = 跳過所有操作，純切牌
            if (buttons.length > 0) {
                 buttons.push({ text: "跳過", action: { type: "CANCEL" } });
            }
        }

        // === 6.2 槓層：ANKAN_SELECTION ===
        else if (state.phase === "ANKAN_SELECTION") {
            const player = state.players[0];
            // 計算目前暗槓數，傳給邏輯層
            const currentAnkanCount = player.fulu.filter(m => m.type === "ankan").length;
            
            // 取得具體的槓牌列表
            const kanList = state.logic.getAnkanTiles(
                player.tepai, 
                currentAnkanCount,
                player.isReach ? player.riichiWaitSet : null
            );

            // 產生圖像化按鈕
            kanList.forEach(tile => {
                buttons.push({ 
                    text: "", // 不顯示文字，改顯示牌
                    tileIcon: tile, // 特殊屬性：要畫的牌
                    action: { type: "ANKAN", tile: tile } 
                });
            });

            // 返回 Root 層
            buttons.push({ text: "返回", action: { type: "CANCEL" } });
        }

        // === 6.3 立直層：RIICHI_DECLARATION ===
        else if (state.phase === "RIICHI_DECLARATION") {
            // 這裡提示玩家切牌，只給一個返回按鈕
            buttons.push({ text: "返回", action: { type: "CANCEL" } });
        }

        // === 6.4 回應層：REACTION_DECISION ===
        else if (state.phase === "REACTION_DECISION") {
            if (actions.canRon) buttons.push({ text: "榮和", action: { type: "RON" } });
            // 這裡的取消是「見逃/不榮和」
            buttons.push({ text: "跳過", action: { type: "CANCEL" } });
        }

        if (buttons.length === 0) return;

        // === 繪製按鈕 (從右往左) ===
        let x = anchorRight - btnW;
        for (let i = buttons.length - 1; i >= 0; i--) {
            const btn = buttons[i];
            
            // 傳入 tileIcon 參數
            this.drawUIButton(x, y, btnW, btnH, btn.text, btn.tileIcon);
            
            this.uiButtons.push({ x, y, w: btnW, h: btnH, action: btn.action });
            x -= (btnW + gap);
        }
    }

    // 判斷玩家是否有控制權
    _isPlayerControllablePhase() {
        const state = this.gameState;
        if (state.phase === "PLAYER_DECISION" && state.turn === 0) return true;
        if (state.phase === "ANKAN_SELECTION" && state.turn === 0) return true; // 新增狀態
        if (state.phase === "RIICHI_DECLARATION") return true;
        
        if (state.phase === "REACTION_DECISION") {
            // 注意：lastDiscard 不是自己打的才有的榮
            if (state.lastDiscard && state.lastDiscard.fromPlayer !== 0) {
                 return true;
            }
        }
        return false;
    }

    // 增強版按鈕繪製：支援畫牌
    drawUIButton(x, y, w, h, text, tileIcon = null) {
        const ctx = this.ctx;

        // 背景
        const gradient = ctx.createLinearGradient(x, y, x, y + h);
        gradient.addColorStop(0, "#4a4a4a");
        gradient.addColorStop(1, "#2b2b2b");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);

        // 邊框
        ctx.strokeStyle = "#a0a0a0";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // 內容：如果有 tileIcon 就畫牌，不然畫文字
        if (tileIcon !== null && tileIcon !== undefined) {
            // 牌畫在按鈕中間
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

        if (result.type === "ryuukyoku") {
            this._drawRyuukyoku();
            return;
        }
        
        // 半透明遮罩
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";
        
        // 標題
        this.ctx.font = "bold 60px sans-serif";
        let title = "對局終了";
        if (result.score && result.score.yakumanRank > 0) title = "役滿！";
        this.ctx.fillText(title, 512, 300);

        // 分數與役種
        if (result.score) {
            this.ctx.font = "40px sans-serif";
            this.ctx.fillStyle = "#ffcc00";
            
            // 顯示飜數/符數
            const detail = result.score.display || `${result.best.han}飜 ${result.fu}符`;
            this.ctx.fillText(detail, 512, 400);

            // 勝利類型文字
            const roleText = result.isParent ? "親" : "子";
            const winText = result.winType === "tsumo" ? "自摸" : "榮和";
            
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "30px sans-serif";
            this.ctx.fillText(`${roleText} ${winText} ${result.score.total} 點`, 512, 480);
            
            // 列出役種
            if (result.score.yakus && result.score.yakus.length > 0) {
                let y = 550;
                this.ctx.font = "24px sans-serif";
                result.score.yakus.forEach(yaku => {
                    this.ctx.fillText(yaku, 512, y);
                    y += 35;
                });
            }
        }
        
        this.ctx.font = "20px sans-serif";
        this.ctx.fillStyle = "#aaa";
        this.ctx.fillText("點擊任意處重新開始", 512, 800);
    }

    _drawRyuukyoku() {
        const ctx = this.ctx;

        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";

        ctx.font = "bold 64px sans-serif";
        ctx.fillText("流局", 512, 400);

        ctx.font = "28px sans-serif";
        ctx.fillStyle = "#cccccc";
        ctx.fillText("本局無人和牌", 512, 470);

        ctx.font = "20px sans-serif";
        ctx.fillStyle = "#aaa";
        ctx.fillText("點擊任意處重新開始", 512, 800);
    }

    startDrawAnimation(tile, x, y) {
        this.drawAnimation = { 
            tile, 
            x, 
            y, 
            startY: y - 120, 
            startTime: performance.now(), 
            duration: 500
        };
    }
}
