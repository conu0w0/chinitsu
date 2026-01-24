export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;
        this.uiContainer = document.getElementById("ui-overlay");

        // 設定內部解析度為 1024x1024
        this.canvas.width = 1024;
        this.canvas.height = 1024;

        // 參數設定
        this.tileWidth = 56;  // 稍微縮小一點點，讓排版更寬裕
        this.tileHeight = 84;
        this.tileGap = 2;
        this.drawGap = 56;    // 摸牌間距
        
        // 中心點 x = 512
        // 手牌總寬度約 800px，起始點 x 約 112
        this.ZONES = {
            // 玩家手牌 (貼近底部)
            playerHand: { x: 110, y: 900 },

            // 玩家牌河 (中間偏下，左右置中)
            // 6張牌寬約 240px，512 - 120 = 392
            playerRiver: { x: 340, y: 600, cols: 6 },

            // 對手牌河 (中間偏上)
            comRiver: { x: 340, y: 300, cols: 6 },

            // 對手手牌 (貼近頂部)
            opponentHand: { x: 110, y: 50 }
        };
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 繪製背景圖 (填滿 1024x1024)
        if (this.assets.table) {
            this.ctx.drawImage(this.assets.table, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // 如果沒有圖片，用深綠色填滿
            this.ctx.fillStyle = "#1b4d3e"; 
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            // 畫個邊框示意
            this.ctx.strokeStyle = "#d4af37"; // 金色邊框
            this.ctx.lineWidth = 10;
            this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        }

        this.drawInfo();
        this.drawRivers();
        this.drawHands();
        this.renderUI();

        if (this.gameState.phase === "ROUND_END") {
            this.drawResult(this.gameState.lastResult);
        }
    }

    drawInfo() {
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        this.ctx.font = "bold 24px sans-serif";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        
        // 把資訊放在左上角，稍微避開對手手牌
        this.ctx.fillText(`剩餘: ${this.gameState.yama.length}`, 20, 160);
        this.ctx.fillText(`Dora:`, 20, 200);
        
        // 顯示結果字串 (如果有)
        if (this.gameState.lastResult) {
            this.ctx.fillStyle = "#ffff00";
            this.ctx.textAlign = "center";
            this.ctx.fillText("按畫面任意處重新開始", 512, 500);
        }
    }

    _drawHands() {
        this._drawPlayerHand();
        this._drawOpponentHand();
    }

    _drawPlayerHand() {
        const player = this.gameState.players[0];
        const zone = this.ZONES.playerHand;
        
        const isTsumoState = (player.tepai.length % 3 === 2);
        const lastIndex = player.tepai.length - 1;

        player.tepai.forEach((tile, i) => {
            let x = zone.x + i * (this.tileWidth + this.tileGap);
            if (isTsumoState && i === lastIndex) {
                x += this.drawGap;
            }
            this.drawTile(tile, x, zone.y, this.tileWidth, this.tileHeight);
        });
    }

    _drawOpponentHand() {
        const com = this.gameState.players[1];
        const zone = this.ZONES.opponentHand;
        for (let i = 0; i < com.tepai.length; i++) {
            let x = zone.x + i * (40 + 2); // 對手牌畫小且擠一點，當作遠景
            this.drawTile(-1, x, zone.y, 40, 60, { faceDown: true });
        }
    }
    
    drawRivers() {
        this._drawRiverGroup(this.gameState.players[0].river, this.ZONES.playerRiver);
        this._drawRiverGroup(this.gameState.players[1].river, this.ZONES.comRiver);
    }
    
    _drawRiverGroup(riverData, zone) {
        riverData.forEach((item, i) => {
            const x = zone.x + (i % zone.cols) * (44); // 稍微緊湊一點
            const y = zone.y + Math.floor(i / zone.cols) * (60); 
            this.drawTile(item.tile, x, y, 40, 56, { isRiichi: item.isRiichi });
        });
    }

    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown = false, isRiichi = false } = options;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];

        if (img) {
            this.ctx.drawImage(img, x, y, w, h);
            if (isRiichi) {
                this.ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
                this.ctx.fillRect(x, y, w, h);
            }
            return;
        }

        // Fallback
        this.ctx.fillStyle = faceDown ? "#234" : "#f0f0f0";
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = "#000";
        this.ctx.strokeRect(x, y, w, h);

        if (isRiichi) {
            this.ctx.fillStyle = "rgba(255,0,0,0.3)";
            this.ctx.fillRect(x, y, w, h);
        }

        if (!faceDown) {
            this.ctx.fillStyle = "#c00";
            this.ctx.font = `${Math.floor(h*0.6)}px Arial`;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(`${tileVal + 1}s`, x + w/2, y + h/2 + 2);
        }
    }

    renderUI() {
        this.uiContainer.innerHTML = "";
        const actions = this.gameState.getLegalActions(0);
        const createBtn = (text, type, payload = {}) => {
            const btn = document.createElement("button");
            btn.className = "ui-btn";
            btn.textContent = text;
            btn.dataset.type = type;
            if (Object.keys(payload).length > 0) {
                btn.dataset.payload = JSON.stringify(payload);
            }
            this.uiContainer.appendChild(btn);
        };

        if (actions.canTsumo) createBtn("自摸", "TSUMO");
        if (actions.canRon) createBtn("榮和", "RON");
        if (actions.canRiichi) createBtn("立直", "RIICHI");
        if (actions.canAnkan) {
            const hand = this.gameState.players[0].tepai;
            const counts = {};
            hand.forEach(t => counts[t] = (counts[t]||0)+1);
            const kanTile = parseInt(Object.keys(counts).find(k => counts[k]===4));
            createBtn("槓", "ANKAN", { tile: kanTile });
        }
        if (actions.canCancel) createBtn("取消", "CANCEL");
    }

    drawResult(result) {
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "center";
        this.ctx.font = "60px sans-serif";
        this.ctx.fillText("對局終了", 512, 400);

        if (result && result.score) {
            this.ctx.fillStyle = "#ffcc00";
            this.ctx.fillText(result.score.display || "", 512, 500);
            this.ctx.font = "30px sans-serif";
            this.ctx.fillStyle = "#fff";
            this.ctx.fillText(`飜: ${result.score.han} / 符: ${result.score.fu} `, 512, 580);
        }
        this.ctx.font = "20px sans-serif";
        this.ctx.fillStyle = "#ccc";
        this.ctx.fillText("點擊畫面重來", 512, 700);
    }
}
