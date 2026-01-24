/**
 * InputHandler.js
 * 只負責「玩家點擊輸入」
 * - 點手牌：出牌 / 暗槓
 * - ROUND_END：點一下重新開始
 */

export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;

        this.canvas.addEventListener("click", (e) => this._onClick(e));
    }

    /* ======================
       主入口
       ====================== */
    _onClick(event) {
        const rect = this.canvas.getBoundingClientRect();

        // 實際顯示尺寸 vs canvas 內部尺寸
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        // 把螢幕座標轉回 canvas 座標
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        // ROUND_END → 任意點擊重新開始
        if (this.state.phase === "ROUND_END") {
            this.state.initKyoku(this.state.parentIndex);
            this.renderer.render(this.state);
            return;
        }

        // 只處理「點玩家手牌」
        this._handlePlayerHandClick(x, y);
    }

    /* ======================
       點玩家手牌
       ====================== */
    _handlePlayerHandClick(px, py) {
        const player = this.state.players[0];
        if (!player) return;

        // === Renderer 資訊（一定要用 Renderer 的）===
        const zone = this.renderer.ZONES.playerHand;
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        const gap = 6; // 必須和 Renderer 一致
        const ox = this.renderer.originX;
        const oy = this.renderer.originY;

        for (let i = 0; i < player.tepai.length; i++) {
            const x = ox + zone.x + i * (tileW + gap);
            const y = oy + zone.y;

            if (this._hit(px, py, x, y, tileW, tileH)) {
                this._onTileClicked(i, player.tepai[i]);
                return;
            }
        }
    }

    /* ======================
       點到某一張牌
       ====================== */
    _onTileClicked(index, tile) {
        const actions = this.state.getLegalActions(0);
        const player = this.state.players[0];

        // === 暗槓優先 ===
        if (actions.canAnkan) {
            const count = player.tepai.filter(t => t === tile).length;
            if (count === 4) {
                this.state.applyAction(0, {
                    type: "ANKAN",
                    tile
                });
                this.renderer.render(this.state);
                return;
            }
        }

        // === 一般出牌 ===
        if (this.state.phase === "PLAYER_DECISION") {
            this.state.playerDiscard(0, index);
            this.renderer.render(this.state);
        }
    }

    /* ======================
       Hit Test
       ====================== */
    _hit(px, py, x, y, w, h) {
        return (
            px >= x &&
            px <= x + w &&
            py >= y &&
            py <= y + h
        );
    }
}
