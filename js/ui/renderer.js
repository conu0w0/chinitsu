/**
 * Renderer.js
 * Canvas Renderer（第一版・無動畫）
 * - 桌面 / 手牌 / 河 / 副露
 * - Action Buttons（依 getLegalActions 顯示）
 */

export class Renderer {
    constructor(canvas, assets) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.assets = assets;

        this.tileWidth = 40;
        this.tileHeight = 60;

        // 桌布
        this.tableSize = 1024;
        this.originX = (canvas.width - this.tableSize) / 2;
        this.originY = (canvas.height - this.tableSize) / 2;

        // 桌內座標（相對於桌布左上）
        this.ZONES = {
            playerHand: { x: 200, y: 860 },
            opponentHand: { x: 200, y: 100 },

            playerRiver: { x: 350, y: 650, cols: 6 },
            opponentRiver: { x: 350, y: 300, cols: 6 },

            actions: { x: 300, y: 950, gap: 12 }
        };
    }

    /* ======================
       主入口
       ====================== */
    render(state) {
        this._clear();
        this._drawBackground();

        this._drawHands(state);
        this._drawFulu(state);
        this._drawRivers(state);
        this._drawActions(state);

        if (state.phase === "ROUND_END") {
            this._drawResult(state.lastResult);
        }
    }

    /* ======================
       基礎
       ====================== */
    _clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    _drawBackground() {
        this.ctx.drawImage(
            this.assets.table,
            this.originX,
            this.originY,
            this.tableSize,
            this.tableSize
        );
    }

    /* ======================
       萬用畫牌
       ====================== */
    _drawTile(tile, x, y, options = {}) {
        const { rotate = 0, faceDown = false } = options;
        const img = faceDown ? this.assets.back : this.assets.tiles[tile];

        const cx = this.originX + x;
        const cy = this.originY + y;

        this.ctx.save();
        this.ctx.translate(cx + this.tileWidth / 2, cy + this.tileHeight / 2);
        if (rotate) this.ctx.rotate(rotate);

        this.ctx.drawImage(
            img,
            -this.tileWidth / 2,
            -this.tileHeight / 2,
            this.tileWidth,
            this.tileHeight
        );
        this.ctx.restore();
    }

    /* ======================
       手牌
       ====================== */
    _drawHands(state) {
        const gap = 6;

        // 玩家
        const player = state.players[0];
        const zone = this.ZONES.playerHand;

        player.tepai.forEach((tile, i) => {
            const x = zone.x + i * (this.tileWidth + gap);
            const y = zone.y;
            this._drawTile(tile, x, y);
        });

        // 對手（牌背）
        const opp = state.players[1];
        const oppZone = this.ZONES.opponentHand;

        opp.tepai.forEach((_, i) => {
            const x = oppZone.x + i * (this.tileWidth + gap);
            const y = oppZone.y;
            this._drawTile(0, x, y, { faceDown: true });
        });
    }

    /* ======================
       副露（暗槓）
       ====================== */
    _drawFulu(state) {
        const player = state.players[0];
        const baseY = this.ZONES.playerHand.y - 70;

        player.fulu.forEach((f, i) => {
            if (f.type !== "ankan") return;

            for (let j = 0; j < 4; j++) {
                const x = 200 + i * 200 + j * (this.tileWidth + 2);
                this._drawTile(f.tile, x, baseY, {
                    faceDown: j === 1 || j === 2
                });
            }
        });
    }

    /* ======================
       牌河
       ====================== */
    _drawRivers(state) {
        const gapX = this.tileWidth + 6;
        const gapY = this.tileHeight + 6;

        // 玩家牌河
        const river = state.players[0].river;
        const zone = this.ZONES.playerRiver;

        river.forEach((r, i) => {
            const x = zone.x + (i % zone.cols) * gapX;
            const y = zone.y - Math.floor(i / zone.cols) * gapY;
            this._drawTile(r.tile, x, y, {
                rotate: r.isRiichi ? Math.PI / 2 : 0
            });
        });

        // 對手牌河
        const oppRiver = state.players[1].river;
        const oppZone = this.ZONES.opponentRiver;

        oppRiver.forEach((r, i) => {
            const x = oppZone.x + (i % oppZone.cols) * gapX;
            const y = oppZone.y + Math.floor(i / oppZone.cols) * gapY;
            this._drawTile(r.tile, x, y);
        });
    }

    /* ======================
       行為按鈕
       ====================== */
    _drawActions(state) {
        const a = state.getLegalActions(0);
        const zone = this.ZONES.actions;

        let x = zone.x;
        const y = zone.y;

        const buttons = [
            ["槓", a.canAnkan],
            ["立直", a.canRiichi],
            ["榮和", a.canRon],
            ["自摸", a.canTsumo],
            ["取消", a.canCancel]
        ];

        for (const [label, enabled] of buttons) {
            if (!enabled) continue;
            this._drawButton(label, x, y);
            x += 90 + zone.gap;
        }
    }

    _drawButton(label, x, y) {
        const w = 90;
        const h = 36;

        this.ctx.fillStyle = "#333";
        this.ctx.fillRect(x, y, w, h);

        this.ctx.strokeStyle = "#aaa";
        this.ctx.strokeRect(x, y, w, h);

        this.ctx.fillStyle = "#fff";
        this.ctx.font = "16px sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(label, x + w / 2, y + h / 2);
    }

    /* ======================
       結果顯示
       ====================== */
    _drawResult(result) {
        if (!result) return;

        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "white";
        this.ctx.font = "28px sans-serif";
        this.ctx.fillText("和了！", 300, 300);

        if (result.score?.display) {
            this.ctx.font = "18px sans-serif";
            this.ctx.fillText(result.score.display, 300, 340);
        }
    }
}
