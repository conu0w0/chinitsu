export class Renderer {
    constructor(canvas, gameState, assets = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.gameState = gameState;
        this.assets = assets;
        this.uiButtons = [];   
        this.drawAnimation = null;

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
        this.drawDrawAnimation();
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

                if (!this.drawAnimation) {
                    this.startDrawAnimation(tile, x, zone.y);
                    return;
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
            const isLast = (this.gameState.lastDiscard &&
                            this.gameState.lastDiscard.fromPlayer === (reverse ? 1 : 0) &&
                            i === riverData.length - 1);
            
            const rotate = item.isRiichi ? (reverse ? -90 : 90) : 0;
            this.drawTile(item.tile, x, y, 40, 56, { rotate, highlight: isLast });
        });
    }

    drawTile(tileVal, x, y, w, h, options = {}) {
        const { faceDown = false, highlight = false, rotate = 0 } = options;
        const img = faceDown ? this.assets.back : this.assets.tiles?.[tileVal];

        const ctx = this.ctx;

        if (rotate !== 0) {
            ctx.save();
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate((rotate * Math.PI) / 180);

            // === 牌本體 ===
            if (img) {
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
            } else {
                ctx.fillStyle = faceDown ? "#234" : "#f0f0f0";
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.strokeStyle = "#000";
                ctx.strokeRect(-w / 2, -h / 2, w, h);
            }

            // === highlight（跟著旋轉）===
            if (highlight) {
                ctx.strokeStyle = "#ffd700";
                ctx.lineWidth = 2;
                ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
            }
            ctx.restore();
            return;
        }

        // ======================
        // 沒旋轉的情況（原本）
        // ======================

        if (img) {
            ctx.drawImage(img, x, y, w, h);
        } else {
            ctx.fillStyle = faceDown ? "#234" : "#f0f0f0";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = "#000";
            ctx.strokeRect(x, y, w, h);
        }

        if (highlight) {
            ctx.strokeStyle = "#ffd700";
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        }
    }

    drawDrawAnimation() {
        if (!this.drawAnimation) return;

        const ctx = this.ctx;
        const now = performance.now();
        const anim = this.drawAnimation;

        const t = Math.min((now - anim.startTime) / anim.duration, 1);

        // ease-out
        const ease = 1 - Math.pow(1 - t, 3);

        const y = anim.startY + (anim.y - anim.startY) * ease;
        const alpha = ease;

        ctx.save();
        ctx.globalAlpha = alpha;

        this.drawTile(anim.tile, anim.x, y, this.tileWidth, this.tileHeight);
        ctx.restore();

        if (t >= 1) {
            this.drawAnimation = null;
        }
    }

    renderUI() {
        this.uiButtons = [];

        const state = this.gameState;
        const phase = state.phase;

        // 若不是當前可行動者 → 一律不畫
        if (!this._isPlayerControllablePhase()) return;

        const actions = state.getLegalActions(0);
        if (!actions) return;

        const buttons = [];
        const handZone = this.ZONES.playerHand;

        const btnW = 96;
        const btnH = 44;
        const gap = 10;

        const anchorRight = handZone.x + 12 * (this.tileWidth + this.tileGap) + this.tileWidth;
        const y = handZone.y - btnH - 12;

        /* ======================
           依 phase 決定 UI
           ====================== */

        if (phase === "PLAYER_DECISION") {
            if (actions.canAnkan) buttons.push({ text: "槓", action: { type: "ANKAN" } });
            if (actions.canRiichi) buttons.push({ text: "立直", action: { type: "RIICHI" } });
            if (actions.canTsumo) buttons.push({ text: "自摸", action: { type: "TSUMO" } });
            if (actions.canCancel) buttons.push({ text: "取消", action: { type: "CANCEL" } });
        }

        if (phase === "RIICHI_DECLARATION") {
            buttons.push({ text: "取消", action: { type: "CANCEL" } });
        }

        if (phase === "REACTION_DECISION") {
            if (actions.canRon) buttons.push({ text: "榮和", action: { type: "RON" } });
            if (actions.canCancel) buttons.push({ text: "取消", action: { type: "CANCEL" } });
        }

        if (buttons.length === 0) return;

        /* ======================
           繪製（右 → 左）
           ====================== */

        let x = anchorRight - btnW;

        for (let i = buttons.length - 1; i >= 0; i--) {
            const btn = buttons[i];
            this.drawUIButton(x, y, btnW, btnH, btn.text);
            this.uiButtons.push({ x, y, w: btnW, h: btnH, action: btn.action });
            x -= btnW + gap;
        }
    }

    _isPlayerControllablePhase() {
        const state = this.gameState;

        if (state.phase === "PLAYER_DECISION" && state.turn === 0) return true;
        if (state.phase === "RIICHI_DECLARATION") return true;

        if (state.phase === "REACTION_DECISION") {
            const responder = (state.turn + 1) % state.players.length;
            return responder === 0;
        }
        return false;
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

    startDrawAnimation(tile, x, y) {
        this.drawAnimation = { tile, x, y, startY: y - 20, startTime: performance.now(), duration: 200 };
    }

}

