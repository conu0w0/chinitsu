export class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.width = canvas.width;
        this.height = canvas.height;
        this.state = null;
        
        // 樣式設定
        this.tileW = 40;
        this.tileH = 60;
        this.handY = this.height - 80;
        this.buttons = []; // 儲存按鈕座標以便偵測點擊
    }

    // 更新並重繪
    update(gameState) {
        this.state = gameState;
        this.render();
    }

    render() {
        // 清空畫面
        this.ctx.fillStyle = "#228B22"; // 麻將桌綠
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.state) return;

        // 1. 繪製對手手牌 (蓋著的)
        // 假設對手有 13 張
        for (let i = 0; i < 13; i++) {
            this.drawTileBack(50 + i * 30, 20);
        }

        // 2. 繪製對手舍牌 (上排)
        // 這裡簡化，直接畫在中間上方
        // 實際專案應從 state.players[1].discards 讀取
        // 這裡暫時略過，專注玩家視角

        // 3. 繪製自己剛摸到的牌 (Incoming Tile)
        let incomingX = -100;
        if (this.state.type === 'DRAW' && this.state.playerIndex === 0) {
            // 畫在手牌右側稍微分開的位置
            const handLen = 13; // 假設手牌固定13張
            incomingX = 50 + handLen * this.tileW + 20;
            this.drawTile(this.state.incomingTile, incomingX, this.handY, true);
        }

        // 4. 繪製自己手牌
        // Game 裡我們沒有把 hand 傳出來，需要在 game.js 的 notifyUI 裡把 player.hand 傳出來
        // 假設 state.hand 存在 (需修改 game.js 或在這裡獲取)
        // *修正*：我們在 Game.notifyUI 裡應該傳入 current player info
        const myHand = this.state.hand || []; 
        myHand.forEach((tileVal, idx) => {
            this.drawTile(tileVal, 50 + idx * this.tileW, this.handY);
        });

        // 5. 繪製操作按鈕
        this.buttons = []; // 重置按鈕區域
        if (this.state.actions && this.state.actions.length > 0) {
            this.drawButtons(this.state.actions);
        }

        // 6. 顯示訊息 (流局/和了)
        if (this.state.type === 'GAME_OVER') {
            this.ctx.fillStyle = "rgba(0,0,0,0.7)";
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.fillStyle = "white";
            this.ctx.font = "30px Arial";
            this.ctx.fillText(this.state.reason, this.width/2 - 50, this.height/2);
            if(this.state.result) {
                this.ctx.font = "20px Arial";
                this.ctx.fillText(this.state.result.scoreName, this.width/2 - 40, this.height/2 + 40);
            }
        }
    }

    // 畫單張牌
    drawTile(val, x, y, isHighlight = false) {
        this.ctx.fillStyle = isHighlight ? "#FFFFE0" : "#FFFFFF";
        this.ctx.fillRect(x, y, this.tileW - 2, this.tileH - 2);
        
        // 畫數字 (索子)
        this.ctx.fillStyle = (val === 1 || val === 5 || val === 9) ? "#D00" : "#060";
        this.ctx.font = "24px bold Arial";
        this.ctx.fillText(val, x + 12, y + 38);
        
        // 畫邊框
        this.ctx.strokeStyle = "#333";
        this.ctx.strokeRect(x, y, this.tileW - 2, this.tileH - 2);
    }

    // 畫牌背
    drawTileBack(x, y) {
        this.ctx.fillStyle = "#1E90FF"; // 藍背
        this.ctx.fillRect(x, y, this.tileW - 2, this.tileH - 2);
        this.ctx.strokeStyle = "#EEE";
        this.ctx.strokeRect(x, y, this.tileW - 2, this.tileH - 2);
    }

    // 畫按鈕
    drawButtons(actions) {
        const startX = this.width / 2 - (actions.length * 60);
        const y = this.height - 160;

        actions.forEach((action, i) => {
            const x = startX + i * 120;
            const w = 100;
            const h = 40;

            this.ctx.fillStyle = "orange";
            this.ctx.fillRect(x, y, w, h);
            this.ctx.fillStyle = "black";
            this.ctx.font = "20px Arial";
            this.ctx.fillText(action, x + 20, y + 28);

            // 儲存按鈕區域用於點擊偵測
            this.buttons.push({ name: action, x, y, w, h });
        });
    }

    // 處理點擊事件，回傳動作指令
    handleClick(x, y) {
        if (!this.state) return null;

        // 1. 檢查按鈕點擊
        for (const btn of this.buttons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return { type: 'BUTTON', action: btn.name };
            }
        }

        // 2. 檢查手牌點擊 (切牌)
        // 只有在自己的回合 (DRAW) 才能切牌
        if (this.state.type === 'DRAW' && this.state.playerIndex === 0) {
            const myHand = this.state.hand || [];
            
            // 檢查手牌列
            for (let i = 0; i < myHand.length; i++) {
                const tx = 50 + i * this.tileW;
                if (x >= tx && x <= tx + this.tileW && y >= this.handY && y <= this.handY + this.tileH) {
                    return { type: 'DISCARD', tile: myHand[i] };
                }
            }

            // 檢查摸到的那張牌 (Incoming)
            const incomingX = 50 + 13 * this.tileW + 20;
            if (x >= incomingX && x <= incomingX + this.tileW && y >= this.handY && y <= this.handY + this.tileH) {
                return { type: 'DISCARD', tile: this.state.incomingTile };
            }
        }

        return null;
    }
}
