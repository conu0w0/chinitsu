/**
 * Renderer.js
 * 繪圖引擎：負責將遊戲狀態轉化為 Canvas 影像
 */

export class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas - HTML 上的畫布元件
     * @param {Object} assets - 預載入的圖片資源 (牌面、背景)
     */
    constructor(canvas, assets) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.assets = assets; // 包含牌面圖案 imgsrc
        
        // 配置參數
        this.config = {
            tileW: 40,  // 單張牌寬度
            tileH: 60,  // 單張牌高度
            takuColor: "#206040", // 麻將桌綠色
            font: "16px Arial"
        };
    }

    /**
     * 主渲染函數：每一幀或狀態更新時呼叫
     * @param {GameState} state - 當前的遊戲狀態
     */
    render(state) {
        this.drawTable();
        this.drawPlayers(state.players, state.turn);
        this.drawYamaCount(state.yama.length);
        this.drawDora(state.doraIndicator);
        this.drawCenterInfo(state);
    }

    /**
     * 繪製麻將桌背景
     */
    drawTable() {
        this.ctx.fillStyle = this.config.takuColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 畫桌邊線 (原本 bamboo.js 中的 draw_taku 邏輯)
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(50, 50, this.canvas.width - 100, this.canvas.height - 100);
    }

    /**
     * 繪製四位玩家的手牌與牌河
     */
    drawPlayers(players, currentTurn) {
        players.forEach((player, index) => {
            // 根據玩家索引 (0:下, 1:右, 2:上, 3:左) 計算座標與旋轉角度
            this.ctx.save();
            this.setupPlayerTransform(index);
            
            // 1. 畫手牌
            this.drawHand(player.tepai, player.id === 0); // 只有 ID 0 (玩家) 的牌是正面的
            
            // 2. 畫牌河 (打出的牌)
            this.drawRiver(player.river);
            
            // 3. 畫頭像與點數
            this.drawPlayerInfo(player, index === currentTurn);

            this.ctx.restore();
        });
    }

    /**
     * 繪製單張麻將牌
     * @param {number} tileID - 牌的編號 (0-33)
     * @param {number} x, y - 座標
     * @param {boolean} isFaceUp - 是否顯示正面
     */
    drawTile(tileID, x, y, isFaceUp = true) {
        if (isFaceUp) {
            // 從 Sprite Sheet 中裁切對應的牌面圖片
            const sx = (tileID % 9) * this.config.tileW;
            const sy = Math.floor(tileID / 9) * this.config.tileH;
            
            this.ctx.drawImage(this.assets.tiles, sx, sy, 
                this.config.tileW, this.config.tileH, 
                x, y, this.config.tileW, this.config.tileH);
        } else {
            // 畫牌背 (bamboo.js 裡的背面邏輯)
            this.ctx.fillStyle = "#114488";
            this.ctx.fillRect(x, y, this.config.tileW, this.config.tileH);
            this.ctx.strokeRect(x, y, this.config.tileW, this.config.tileH);
        }
    }

    /**
     * 依據玩家位置旋轉畫布 (簡化座標處理)
     */
    setupPlayerTransform(index) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        if (index === 0) this.ctx.translate(w/2 - 200, h - 80);
        if (index === 1) { this.ctx.translate(w - 80, h/2 + 150); this.ctx.rotate(-Math.PI/2); }
        if (index === 2) { this.ctx.translate(w/2 + 200, 80); this.ctx.rotate(Math.PI); }
        if (index === 3) { this.ctx.translate(80, h/2 - 150); this.ctx.rotate(Math.PI/2); }
    }

    /**
     * 繪製中間的資訊欄 (場風、剩餘牌數)
     */
    drawCenterInfo(state) {
        this.ctx.fillStyle = "#00000088";
        this.ctx.fillRect(this.canvas.width/2 - 60, this.canvas.height/2 - 60, 120, 120);
        
        this.ctx.fillStyle = "#ffffff";
        this.ctx.textAlign = "center";
        this.ctx.fillText(`東 ${state.honba} 本場`, this.canvas.width/2, this.canvas.height/2);
        this.ctx.fillText(`剩餘: ${state.yama.length}`, this.canvas.width/2, this.canvas.height/2 + 30);
    }
}
