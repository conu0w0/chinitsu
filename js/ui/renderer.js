/**
 * Renderer.js
 * Canvas 渲染器（索子限定版 / 動畫安全）
 */

export class Renderer {
    constructor(canvas, assets) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.assets = assets;

        this.tileWidth = 40;
        this.tileHeight = 60;
    }

    /* ======================
       主入口（只畫，不改 state）
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
            0, 0,
            this.canvas.width,
            this.canvas.height
        );
    }

    /* ======================
       萬用畫牌
       ====================== */
    _drawTile(tile, x, y, options = {}) {
        const {
            rotate = 0,
            faceDown = false,
            flip = false
        } = options;

        const img = faceDown
            ? this.assets.back
            : this.assets.tiles[tile];

        this.ctx.save();
        this.ctx.translate(
            x + this.tileWidth / 2,
            y + this.tileHeight / 2
        );

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
       動畫（只畫 animationQueue）
       ====================== */
    _drawAnimations(state) {
        for (const anim of state.animationQueue) {

            // === 抽牌動畫 ===
            if (anim.type === "draw") {
                const fromX = this.canvas.width / 2;
                const fromY = 20;

                const toX = 50 + anim.toIndex * (this.tileWidth + 4);
                const toY = this.canvas.height - 80;

                const x = fromX + (toX - fromX) * anim.progress;
                const y = fromY + (toY - fromY) * anim.progress;

                this._drawTile(anim.tile, x, y);
            }

            // === 丟牌動畫 ===
            if (anim.type === "discard") {
                const fromX = 50 + anim.fromIndex * (this.tileWidth + 4);
                const fromY = this.canvas.height - 80;

                const toX = 50 + (anim.toIndex % 6) * (this.tileWidth + 6);
                const toY = this.canvas.height - 260
                    - Math.floor(anim.toIndex / 6) * (this.tileHeight + 6);

                const x = fromX + (toX - fromX) * anim.progress;
                const y = fromY + (toY - fromY) * anim.progress;

                this._drawTile(anim.tile, x, y, {
                    rotate: anim.isRiichi ? Math.PI / 2 : 0
                });
            }
        }
    }

    /* ======================
       手牌（排除動畫中的牌）
       ====================== */
    _drawHands(state) {
        const player = state.players[0];
        const y = this.canvas.height - 80;

        const animating = new Set(
            state.animationQueue
                .filter(a => a.type === "draw" || a.type === "discard")
                .map(a => a.tile)
        );

        player.tepai.forEach((tile, i) => {
            if (animating.has(tile)) return;

            const x = 50 + i * (this.tileWidth + 4);
            this._drawTile(tile, x, y);
        });
    }

    /* ======================
       副露（暗槓）
       ====================== */
    _drawFulu(state) {
        const player = state.players[0];
        const y = this.canvas.height - 170;

        player.fulu.forEach((f, i) => {
            if (f.type === "ankan") {
                for (let j = 0; j < 4; j++) {
                    const x = 50 + i * 200 + j * (this.tileWidth + 2);
                    this._drawTile(f.tile, x, y, {
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
        const player = state.players[0];
        const startX = 50;
        const startY = this.canvas.height - 260;

        player.river.forEach((r, i) => {
            const x = startX + (i % 6) * (this.tileWidth + 6);
            const y = startY - Math.floor(i / 6) * (this.tileHeight + 6);

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
       結果顯示
       ====================== */
    _drawResult(result) {
        if (!result) return;

        this.ctx.fillStyle = "rgba(0,0,0,0.7)";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = "white";
        this.ctx.font = "24px sans-serif";

        this.ctx.fillText("和了！", 200, 200);
        this.ctx.font = "18px sans-serif";
        this.ctx.fillText(result.score.display, 200, 240);

        let y = 280;
        result.score.yakus.forEach(yaku => {
            this.ctx.fillText(`・${yaku}`, 200, y);
            y += 22;
        });
    }
}
