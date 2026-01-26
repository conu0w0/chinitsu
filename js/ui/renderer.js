export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;
        this.uiButtons = [];        

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
        this.ctx.fillText(`余: ${this.gameState.yama.length} 張`, 20, 160);
        
        // 顯示結果字串 (如果有)
        if (this.gameState.lastResult) {
            this.ctx.fillStyle = "#ffff00";
            this.ctx.textAlign = "center";
        }
    }

    drawHands() {
        this._drawPlayerHand();
        this._drawPlayerMelds();
        this._drawOpponentHand();
        this._drawOpponentMelds();
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

    _drawPlayerMelds() {
        const player = this.gameState.players[0];
        const melds = player.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.playerHand;

        // 計算手牌實際寬度（含摸牌凸出）
        const handCount = player.tepai.length;
        const isTsumoState = (handCount % 3 === 2);
        const handWidth = handCount * (this.tileWidth + this.tileGap) + (isTsumoState ? this.drawGap : 0);

        // 副露起點 = 手牌右側 + 一點間距
        let x = handZone.x + handWidth + 16;
        const y = handZone.y;

        melds.forEach((meld) => {
            if (meld.type === "ankan") {
                for (let i = 0; i < 4; i++) {
                    const faceDown = (i === 0 || i === 3);
                    this.drawTile(meld.tile, x + i * (this.tileWidth + 2), y, this.tileWidth, this.tileHeight, { faceDown  }
                    );
                }
                x += 4 * (this.tileWidth + 8); // 槓組之間留距離
            }
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

    _drawOpponentMelds() {
        const com = this.gameState.players[1];
        const melds = com.fulu;
        if (!melds || melds.length === 0) return;

        const handZone = this.ZONES.opponentHand;

        const handCount = com.tepai.length;
        const isTsumoState = (handCount % 3 === 2);
        const handWidth = handCount * (40 + 2) + (isTsumoState ? this.drawGap : 0);

        //  副露在「手牌左側」
        let x = handZone.x - 16;
        const y = handZone.y;

        melds.forEach((meld) => {
            if (meld.type === "ankan") {
                // 往左畫
                x -= 4 * (40 + 2);
                
                for (let i = 0; i < 4; i++) {
                    const faceDown = (i === 0 || i === 3);
                    this.drawTile(meld.tile, x + i * (40 + 2), y, 40, 60, { faceDown });
                }

                x -= 12; // 槓與槓之間的間距
            }
        });
    }
    
    drawRivers() {
        this._drawRiverGroup(this.gameState.players[0].river, this.ZONES.playerRiver, false);
        this._drawRiverGroup(this.gameState.players[1].river, this.ZONES.comRiver, true);
    }
    
    _drawRiverGroup(riverData, zone, reverse = false) {
        riverData.forEach((item, i) => {
            const col = i % zone.cols;
            const row = Math.floor(i / zone.cols);
            const x = reverse ? zone.x + (zone.cols - 1 - col) * (44) : zone.x + col * (44);
            const y = zone.y + Math.floor(i / zone.cols) * (60); 
            const isLast = (i === riverData.length - 1);
            const rotate = item.isRiichi ? (reverse ? -90 : 90) : 0;
            this.drawTile(item.tile, x, y, 40, 56, { rotate, highlight: isLast });
        });
    }

    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown = false, highlight = false, rotate = 0 } = options;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];

        if (img) {
            if (rotate !== 0) {
                this.ctx.save();
                this.ctx.translate(x + w / 2, y + h / 2);
                this.ctx.rotate((rotate * Math.PI) / 180);
                this.ctx.drawImage(img, -w / 2, -h / 2, w, h);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(img, x, y, w, h);
            }

            if (highlight) {
                this.ctx.strokeStyle = "#ffd700";
                this.ctx.lineWidth = 4;
                this.ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
            }
            
            return;
        }

        // Fallback
        this.ctx.fillStyle = faceDown ? "#234" : "#f0f0f0";
        this.ctx.fillRect(x, y, w, h);
        this.ctx.strokeStyle = "#000";
        this.ctx.strokeRect(x, y, w, h);

        if (!faceDown) {
            this.ctx.fillStyle = "#c00";
            this.ctx.font = `${Math.floor(h*0.6)}px Arial`;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(`${tileVal + 1}s`, x + w/2, y + h/2 + 2);
        }
        if (highlight) {
            this.ctx.strokeStyle = "#ffd700"; // 金色外框
            this.ctx.lineWidth = 4;
            this.ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        }
    }

    renderUI() {
        this.uiButtons = [];

        const state = this.gameState;
        const phase = state.phase;
        const player = state.players[0];
        const handZone = this.ZONES.playerHand;

        // === UI 尺寸 ===
        const btnW = 96;
        const btnH = 44;
        const gap = 10;

        // === 對齊基準：第 13 張手牌右側 ===
        const anchorRight = handZone.x + 12 * (this.tileWidth + this.tileGap) + this.tileWidth;

        // === UI y 位置（在手牌上方一點） ===
        const y = handZone.y - btnH - 12;

        // =================================================
        // phase 決定「要不要畫 UI」與「畫哪一層」
        // =================================================

        const buttons = [];

        switch (phase) {
            case "PLAYER_DECISION": {
                const actions = state.getLegalActions(0);
                if (!actions) return;

                if (actions.canAnkan) {
                    const counts = {};
                    player.tepai.forEach(t => counts[t] = (counts[t] || 0) + 1);
                    const kanTile = parseInt(
                        Object.keys(counts).find(k => counts[k] === 4)
                    );
                    buttons.push({ text: "槓", action: { type: "ANKAN", tile: kanTile } });
                }

                if (actions.canRiichi) buttons.push({ text: "立直", action: { type: "RIICHI" } });
                if (actions.canTsumo)  buttons.push({ text: "自摸", action: { type: "TSUMO" } });

                // root 層才有取消
                if (actions.canCancel) {
                    buttons.push({ text: "取消", action: { type: "CANCEL" } });
                }
                break;
            }

            case "RIICHI_DECLARATION": {
                // 立直宣言中：只能取消
                buttons.push({ text: "取消", action: { type: "CANCEL" } });
                break;
            }    

            case "KAN_DECISION": {
                // 這裡假設 state 已經準備好可選槓組
                const choices = state.pendingKanChoices || [];
                choices.forEach(choice => {
                    buttons.push({
                        text: "槓",
                        action: { type: "KAN_SELECT", tiles: choice }
                    });
                });
                buttons.push({ text: "取消", action: { type: "CANCEL" } });
                break;
            }

            case "PLAYER_RESPONSE": {
                const actions = state.getLegalActions(0);
                if (!actions) return;

                if (actions.canRon) {
                    buttons.push({ text: "榮和", action: { type: "RON" } });
                }

                if (actions.canCancel) {
                    buttons.push({ text: "取消", action: { type: "CANCEL" } });
                }
                break;
            }

            case "DISCARD_ONLY":
            case "RIICHI_LOCKED":
            case "ROUND_END":
            default:
                // 這些層次：完全不畫 UI
                return;
        }

        if (buttons.length === 0) return;

        // =================================================
        // 繪製（從右往左）
        // =================================================
        let x = anchorRight - btnW;

        for (let i = buttons.length - 1; i >= 0; i--) {
            const btn = buttons[i];
            this.drawUIButton(x, y, btnW, btnH, btn.text);
            this.uiButtons.push({ x, y, w: btnW, h: btnH, action: btn.action });
            x -= btnW + gap;
        }
    }

    drawUIButton(x, y, w, h, text) {
        const ctx = this.ctx;

        ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x + w / 2, y + h / 2);
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
        }
        this.ctx.font = "20px sans-serif";
        this.ctx.fillStyle = "#ccc";
        this.ctx.fillText("點擊畫面重來", 512, 700);
    }
}
