/**
 * InputHandler.js
 * 處理 Canvas 點擊（手牌 + Action Buttons）
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

        // 把螢幕座標轉回 canvas 座標（修好縮放問題）
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        // ROUND_END → 任意點擊重新開始
        if (this.state.phase === "ROUND_END") {
            this.state.initKyoku(this.state.parentIndex);
            return;
        }

        // 先判斷 Action Buttons
        if (this._handleActionButtonClick(x, y)) {
            return;
        }

        // 再判斷是不是點到手牌
        this._handlePlayerHandClick(x, y);
    }

    /* ======================
       Action Buttons
       ====================== */
    _handleActionButtonClick(px, py) {
        const actions = this.state.getLegalActions(0);
        const zone = this.renderer.ZONES.actions;

        const w = 90;
        const h = 36;

        let x = this.renderer.originX + zone.x;
        const y = this.renderer.originY + zone.y;

        const buttons = [
            ["ANKAN", "槓", actions.canAnkan],
            ["RIICHI", "立直", actions.canRiichi],
            ["RON", "榮和", actions.canRon],
            ["TSUMO", "自摸", actions.canTsumo],
            ["CANCEL", "取消", actions.canCancel]
        ];

        for (const [type, _label, enabled] of buttons) {
            if (!enabled) continue;

            if (this._hit(px, py, x, y, w, h)) {
                this.state.applyAction(0, { type });
                return true;
            }
            x += w + zone.gap;
        }
        return false;
    }

    /* ======================
       點玩家手牌
       ====================== */
    _handlePlayerHandClick(px, py) {
        const player = this.state.players[0];
        if (!player) return;

        const zone = this.renderer.ZONES.playerHand;
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        const gap = 6;

        const baseX = this.renderer.originX + zone.x;
        const baseY = this.renderer.originY + zone.y;

        for (let i = 0; i < player.tepai.length; i++) {
            const x = baseX + i * (tileW + gap);
            const y = baseY;

            if (this._hit(px, py, x, y, tileW, tileH)) {
                this._onTileClicked(i, player.tepai[i]);
                return;
            }
        }
    }

    _onTileClicked(index, tile) {
        const actions = this.state.getLegalActions(0);
        const player = this.state.players[0];

        // 暗槓優先
        if (actions.canAnkan) {
            const count = player.tepai.filter(t => t === tile).length;
            if (count === 4) {
                this.state.applyAction(0, { type: "ANKAN", tile });
                return;
            }
        }

        // 一般出牌
        if (this.state.phase === "PLAYER_DECISION") {
            this.state.playerDiscard(0, index);
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
