/**
 * InputHandler.js
 * 只處理 Canvas 點擊（玩家切牌）
 * - ❌ 不處理按鈕
 * - ❌ 不處理槓 / 立直
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

        // 修正縮放後的座標
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        // ROUND_END → 點一下重新開始
        if (this.state.phase === "ROUND_END") {
            this.state.initKyoku(this.state.parentIndex);
            return;
        }

        // 只處理玩家手牌
        this._handlePlayerHandClick(x, y);
    }

    /* ======================
       點玩家手牌（只切牌）
       ====================== */
    _handlePlayerHandClick(px, py) {
        const player = this.state.players[0];
        if (!player) return;

        // 只能在自己回合切牌
        if (
            this.state.phase !== "PLAYER_DECISION" ||
            this.state.turn !== 0
        ) {
            return;
        }

        const zone = this.renderer.ZONES.playerHand;
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        const gap = this.renderer.tileGap ?? 6;

        const baseX = this.renderer.originX + zone.x;
        const baseY = this.renderer.originY + zone.y;

        for (let i = 0; i < player.tepai.length; i++) {
            const x = baseX + i * (tileW + gap);
            const y = baseY;

            if (this._hit(px, py, x, y, tileW, tileH)) {
                this.state.playerDiscard(0, i);
                return;
            }
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
