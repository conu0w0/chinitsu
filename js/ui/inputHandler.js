/**
 * InputHandler.js
 * 只負責「點牌」的輸入處理
 */

export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;

        canvas.addEventListener("click", (e) => this._onClick(e));
    }

    /* ======================
       主入口
       ====================== */
    _onClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // ROUND_END → 點一下重新開始
        if (this.state.phase === "ROUND_END") {
            this.state.initKyoku(this.state.parentIndex);
            return;
        }

        // 只處理「點手牌」
        this._handleHandClick(x, y);
    }

    /* ======================
       點手牌：出牌 / 暗槓
       ====================== */
    _handleHandClick(x, y) {
        const player = this.state.players[0];

        // 玩家手牌區域（要和 Renderer 對齊）
        const handZone = this.renderer.ZONES.playerHand;
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        const gap = 4;

        for (let i = 0; i < player.tepai.length; i++) {
            const tileX = handZone.x + i * (tileW + gap);
            const tileY = handZone.y;

            if (this._hit(x, y, tileX, tileY, tileW, tileH)) {
                this._onTileClicked(i, player.tepai[i]);
                return;
            }
        }
    }

    _onTileClicked(index, tile) {
        const actions = this.state.getLegalActions(0);

        // === 暗槓（點牌直接成立） ===
        if (actions.canAnkan) {
            const count = this.state.players[0].tepai
                .filter(t => t === tile).length;

            if (count === 4) {
                this.state.applyAction(0, {
                    type: "ANKAN",
                    tile
                });
                return;
            }
        }

        // === 正常出牌 ===
        if (this.state.phase === "PLAYER_DECISION") {
            this.state.playerDiscard(0, index);
        }
    }

    /* ======================
       小工具
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
