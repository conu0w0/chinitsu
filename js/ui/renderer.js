/**
 * Renderer.js
 * Canvas 渲染器（索子限定版 / 桌內座標系完成）
 */

export class Renderer {
    constructor(canvas, assets) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.assets = assets;

        this.tileWidth = 40;
        this.tileHeight = 60;

        // === 🀄 桌布固定尺寸 ===
        this.tableSize = 1024;

        // === 🀄 桌布置中座標 ===
        this.originX = (this.canvas.width - this.tableSize) / 2;
        this.originY = (this.canvas.height - this.tableSize) / 2;

        // === 🀄 桌內座標系（全部以桌布左上為原點）===
        this.ZONES = {
            playerHand: { x: 200, y: 860 },
            opponentHand: { x: 200, y: 100 },

            playerRiver: { x: 350, y: 650, cols: 6 },
            opponentRiver: { x: 350, y: 300, cols: 6 }
        };
    }

    /* ======================
       主入口
       ====================== */
    render(state) {
        this._clear();
        this._drawBackground();

        this._drawAnimations(state);
        this._drawHands(state);
        this._drawFulu(state);
        this._drawRivers(state);
        this._drawUI(state);

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
       萬用畫牌（桌內 → canvas 轉換）
       ====================== */
    _drawTile(tile, x, y, options = {}) {
        const { rotate = 0, faceDown = false, flip = false } = options;

        const img = faceDown ? this.assets.back : this.assets.tiles[tile];

        const cx = this.originX + x;
        const cy = this.originY + y;

        this.ctx.save();
        this.ctx.translate(cx + this.tileWidth / 2, cy + this.tileHeight / 2);

        if (flip) this.ctx.rotate(Math.PI);
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
       動畫
       ====================== */
    _drawAnimations(state) {
        for (const anim of state.animationQueue) {
            if (anim.type === "draw") {
                const from = { x: 512, y: 40 };
                const to = {
                    x: this.ZONES.playerHand.x + anim.toIndex * (this.tileWidth + 6),
                    y: this.ZONES.playerHand.y
                };

                const x = from.x + (to.x - from.x) * anim.progress;
                const y = from.y + (to.y - from.y) * anim.progress;

                this._drawTile(anim.tile, x, y);
            }

            if (anim.type === "discard") {
                const from = {
                    x: this.ZONES.playerHand.x + anim.fromIndex * (this.tileWidth + 6),
                    y: this.ZONES.playerHand.y
                };

                const to = {
                    x: this.ZONES.playerRiver.x +
                        (anim.toIndex % 6) * (this.tileWidth + 6),
                    y: this.ZONES.playerRiver.y -
                        Math.floor(anim.toIndex / 6) * (this.tileHeight + 6)
                };

                const x = from.x + (to.x - from.x) * anim.progress;
                const y = from.y + (to.y - from.y) * anim.progress;

                this._drawTile(anim.tile, x, y, {
                    rotate: anim.isRiichi ? Math.PI / 2 : 0
                });
            }
        }
    }

    /* ======================
       手牌
       ====================== */
    _drawHands(state) {
        const player = state.players[0];
        const zone = this.ZONES.playerHand;

        player.tepai.forEach((tile, i) => {
            const x = zone.x + i * (this.tileWidth + 6);
            const y = zone.y;
            this._drawTile(tile, x, y);
        });

        // 對手（先畫牌背）
        const opp = state.players[1];
        const oppZone = this.ZONES.opponentHand;

        opp.tepai.forEach((_, i) => {
            const x = oppZone.x + i * (this.tileWidth + 6);
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
            if (f.type === "ankan") {
                for (let j = 0; j < 4; j++) {
                    const x = 200 + i * 200 + j * (this.tileWidth + 2);
                    this._drawTile(f.tile, x, baseY, {
                        faceDown: j === 1 || j === 2
                    });
                }
            }
        });
    }

    /* ======================
       牌河
       ====================== */
    _drawRivers(state) {
        const river = state.players[0].river;
        const zone = this.ZONES.playerRiver;

        river.forEach((r, i) => {
            const x = zone.x + (i % zone.cols) * (this.tileWidth + 6);
            const y = zone.y - Math.floor(i / zone.cols) * (this.tileHeight + 6);

            this._drawTile(r.tile, x, y, {
                rotate: r.isRiichi ? Math.PI / 2 : 0,
                flip: r.flip
            });
        });
    }

    /* ======================
       UI
       ====================== */
    _drawUI(state) {
        const actions = state.getLegalActions(0);

        this.ctx.fillStyle = "white";
        this.ctx.font = "16px sans-serif";

        let y = 30;
        if (actions.canTsumo) this.ctx.fillText("【自摸】", 20, y += 20);
        if (actions.canRon) this.ctx.fillText("【榮和】", 20, y += 20);
        if (actions.canRiichi) this.ctx.fillText("【立直】", 20, y += 20);
        if (actions.canAnkan) this.ctx.fillText("【暗槓】", 20, y += 20);
        if (actions.canCancel) this.ctx.fillText("【取消】", 20, y += 20);
    }

    /* ======================
       結果
       ====================== */
    _drawResult(result) {
        if (!result || result.type === "chombo") return;

        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "white";
        this.ctx.font = "24px sans-serif";
        this.ctx.fillText("和了！", 200, 200);

        this.ctx.font = "18px sans-serif";
        this.ctx.fillText(result.score.display, 200, 240);
    }
}
