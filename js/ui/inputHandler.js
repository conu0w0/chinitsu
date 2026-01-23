/**
 * InputHandler.js
 * 使用滑鼠操作遊戲（點牌 / 點指令）
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

        // 1️⃣ 先檢查 UI 指令
        if (this._handleActionClick(x, y)) return;

        // 2️⃣ 再檢查是否點到手牌
        if (this._handleHandClick(x, y)) return;
    }

    /* ======================
       點 UI 指令
       ====================== */
    _handleActionClick(x, y) {
        const actions = this.state.getLegalActions(0);

        // UI 區域（要跟 Renderer 對齊）
        let currentY = 30;

        const check = (cond, label, type) => {
            if (!cond) return false;
            currentY += 20;

            if (this._hit(x, y, 20, currentY - 16, 120, 18)) {
                this.state.applyAction(0, { type });
                return true;
            }
            return false;
        };

        if (check(actions.canTsumo, "自摸", "TSUMO")) return true;
        if (check(actions.canRon, "榮和", "RON")) return true;
        if (check(actions.canRiichi, "立直", "RIICHI")) return true;
        if (check(actions.canAnkan, "暗槓", "ANKAN_SELECT")) return true;
        if (check(actions.canCancel, "取消", "CANCEL")) return true;

        return false;
    }

    /* ======================
       點手牌出牌 / 暗槓選牌
       ====================== */
    _handleHandClick(x, y) {
        const player = this.state.players[0];
        const handY = this.canvas.height - 80;

        for (let i = 0; i < player.tepai.length; i++) {
            const tileX = 50 + i * (this.renderer.tileWidth + 4);

            if (this._hit(
                x, y,
                tileX, handY,
                this.renderer.tileWidth,
                this.renderer.tileHeight
            )) {
                this._onTileClicked(i, player.tepai[i]);
                return true;
            }
        }

        return false;
    }

    _onTileClicked(index, tile) {
        const actions = this.state.getLegalActions(0);

        // === 暗槓選牌模式 ===
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
