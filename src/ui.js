export class UI {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.width = canvas.width;
        this.height = canvas.height;
        this.state = null;
        
        // 樣式設定
        this.tileW = 40;
        this.tileH = 56;
        this.handY = this.height - 80;
        this.buttons = []; 
    }

    update(gameState) {
        this.state = gameState;
        this.render();
    }

    render() {
        // 0. 清空畫面
        this.ctx.fillStyle = "#228B22"; // 綠色牌桌
        this.ctx.fillRect(0, 0, this.width, this.height);

        if (!this.state) return;

        // 解構資料 (預設空物件以免報錯)
        const p0 = this.state.p0 || { hand: [], discards: [], melds: [] }; // 自己
        const p1 = this.state.p1 || { hand: [], discards: [], melds: [] }; // 對手

        // --- 1. 對手區域 (上方) ---
        // 畫對手手牌 (蓋牌)
        // 假設對手手牌數 = 13 - (副露數 * 3)
        const p1HandCount = 13 - (p1.melds.length * 3);
        for (let i = 0; i < p1HandCount; i++) {
            this.drawTileBack(150 + i * 30, 30);
        }
        // 畫對手副露 (槓/碰) - 右上角
        this.drawMelds(p1.melds, this.width - 200, 30, true);
        // 畫對手舍牌 (中間偏上)
        this.drawDiscards(p1.discards, this.width / 2 - 120, 100, true);


        // --- 2. 玩家區域 (下方) ---
        // 畫自己舍牌 (中間偏下)
        this.drawDiscards(p0.discards, this.width / 2 - 120, 300, false);
        
        // 畫自己副露 (槓) - 右下角
        // 計算副露佔用的寬度，避免手牌重疊
        const meldWidth = this.drawMelds(p0.melds, this.width - 50, this.handY, false);

        // 畫自己手牌
        // 注意：Game 傳來的 hand 已經是純淨的手牌陣列 (不含剛摸到的)
        let handStartX = 50;
        p0.hand.forEach((tileVal, idx) => {
            this.drawTile(tileVal, handStartX + idx * this.tileW, this.handY);
        });

        // 畫剛摸到的牌 (如果有)
        // 只有在自己的回合 (DRAW) 且有 incomingTile 時才畫
        if (this.state.incomingTile !== null && this.state.playerIndex === 0) {
            // 畫在手牌最右邊隔開一點
            const incomingX = handStartX + (p0.hand.length * this.tileW) + 20;
            this.drawTile(this.state.incomingTile, incomingX, this.handY, true);
        }

        // --- 3. 介面層 ---
        // 顯示立直棒
        if (p0.isRiichi) this.drawText("REACH", 20, this.handY - 20);
        if (p1.isRiichi) this.drawText("REACH", 20, 80);

        // 按鈕
        this.buttons = []; 
        if (this.state.actions && this.state.actions.length > 0) {
            this.drawButtons(this.state.actions);
        }

        // 遊戲結束訊息
        if (this.state.type === 'GAME_OVER') {
            this.drawGameOver(this.state);
        }
    }

    // === 輔助繪圖函式 ===

    drawDiscards(discards, startX, startY, isUpsideDown) {
        if (!discards) return;
        const tilesPerRow = 6;
        discards.forEach((tile, i) => {
            const row = Math.floor(i / tilesPerRow);
            const col = i % tilesPerRow;
            const x = startX + col * this.tileW;
            const y = startY + row * this.tileH;
            this.drawTile(tile, x, y);
        });
    }

    drawMelds(melds, endX, y, isUpsideDown) {
        if (!melds || melds.length === 0) return 0;
        let currentX = endX;
        
        // 從右向左畫
        melds.forEach(meld => {
            // 畫這組的牌 (例如 4 張)
            meld.tiles.forEach(t => {
                currentX -= 32; // 副露畫小一點
                this.drawTile(t, currentX, y, false, 30, 42); // 小尺寸
            });
            currentX -= 10; // 組與組之間留空
        });
        return endX - currentX; // 回傳總寬度
    }

    drawTile(val, x, y, isHighlight = false, w, h) {
        const width = w || this.tileW;
        const height = h || this.tileH;
        
        this.ctx.fillStyle = isHighlight ? "#FFFFE0" : "#F8F8F8";
        this.ctx.fillRect(x, y, width - 2, height - 2);
        
        // 畫數字
        this.ctx.fillStyle = (val === 1 || val === 5 || val === 9) ? "#D00" : "#060";
        this.ctx.font = `bold ${Math.floor(height * 0.5)}px Arial`;
        this.ctx.fillText(val, x + width * 0.3, y + height * 0.7);
        
        this.ctx.strokeStyle = "#888";
        this.ctx.strokeRect(x, y, width - 2, height - 2);
    }

    drawTileBack(x, y) {
        this.ctx.fillStyle = "#1E90FF";
        this.ctx.fillRect(x, y, this.tileW - 2, this.tileH - 2);
        this.ctx.strokeStyle = "#EEE";
        this.ctx.strokeRect(x, y, this.tileW - 2, this.tileH - 2);
    }

    drawText(txt, x, y) {
        this.ctx.fillStyle = "yellow";
        this.ctx.font = "20px Arial";
        this.ctx.fillText(txt, x, y);
    }

    drawButtons(actions) {
        const startX = this.width / 2 - (actions.length * 60);
        const y = this.height - 180;

        actions.forEach((action, i) => {
            const x = startX + i * 120;
            const w = 100;
            const h = 40;

            this.ctx.fillStyle = "orange";
            this.ctx.fillRect(x, y, w, h);
            this.ctx.fillStyle = "black";
            this.ctx.font = "20px Arial";
            this.ctx.fillText(action, x + 20, y + 28);

            this.buttons.push({ name: action, x, y, w, h });
        });
    }

    drawGameOver(state) {
        this.ctx.fillStyle = "rgba(0,0,0,0.8)";
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.ctx.fillStyle = "white";
        this.ctx.font = "40px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText(state.reason, this.width/2, this.height/2 - 50);
        
        if (state.result) {
            this.ctx.font = "24px Arial";
            this.ctx.fillText(`Winner: Player ${state.winnerIndex}`, this.width/2, this.height/2);
            this.ctx.fillText(`${state.result.han} Han / ${state.result.fu} Fu`, this.width/2, this.height/2 + 40);
            this.ctx.fillText(`Score: ${state.result.score}`, this.width/2, this.height/2 + 80);
            
            // 顯示役種
            if(state.result.yaku) {
                state.result.yaku.forEach((y, i) => {
                    this.ctx.fillText(y.name, this.width/2, this.height/2 + 120 + (i*25));
                });
            }
        }
        this.ctx.textAlign = "left"; // 還原
    }

    handleClick(x, y) {
        if (!this.state) return null;

        // 檢查按鈕
        for (const btn of this.buttons) {
            if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
                return { type: 'BUTTON', action: btn.name };
            }
        }

        // 檢查手牌 (僅限 Player 0 且在 Draw 階段)
        // 修正：只要是我的回合，不管是不是剛摸完，都可以切牌 (包含切剛摸到的)
        if (this.state.playerIndex === 0 && this.state.type === 'DRAW') {
            const p0 = this.state.p0;
            let handStartX = 50;

            // 檢查手牌陣列
            for (let i = 0; i < p0.hand.length; i++) {
                const tx = handStartX + i * this.tileW;
                if (x >= tx && x <= tx + this.tileW && y >= this.handY && y <= this.handY + this.tileH) {
                    return { type: 'DISCARD', tile: p0.hand[i] };
                }
            }

            // 檢查剛摸到的牌 (Incoming)
            if (this.state.incomingTile !== null) {
                const incomingX = handStartX + (p0.hand.length * this.tileW) + 20;
                if (x >= incomingX && x <= incomingX + this.tileW && y >= this.handY && y <= this.handY + this.tileH) {
                    return { type: 'DISCARD', tile: this.state.incomingTile };
                }
            }
        }
        return null;
    }
}
