export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;
        this.canvas.addEventListener("click", (e) => this._onCanvasClick(e));
    }

    /* ======================
       處理 Canvas 點擊 (統一入口)
       ====================== */
    _onCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;

        // UI 按鈕優先（Canvas UI）
        if (this._handleUIButtonClick(px, py)) {
            return;
        }

        // ROUND_END：點哪都重開
        if (this.state.phase === "ROUND_END") {
            this.state.initKyoku(this.state.parentIndex);
            return;
        }

        // 手牌點擊
        this._handlePlayerHandClick(px, py);
    }

    /* ======================
       Canvas UI 按鈕判定
       ====================== */
    _handleUIButtonClick(px, py) {
        const buttons = this.renderer.uiButtons;
        if (!buttons || buttons.length === 0) return false;

        for (const btn of buttons) {
            if (this._hit(px, py, btn.x, btn.y, btn.w, btn.h)) {
                console.log("[Canvas UI] 觸發動作:", btn.action);
                this.state.applyAction(0, btn.action);
                return true;
            }
        }
        return false;
    }

    /* ======================
       判定玩家手牌 (含摸牌間距)
       ====================== */
    _handlePlayerHandClick(px, py) {
        const player = this.state.players[0];
        if (!player) return;

        if (this.state.phase !== "PLAYER_DECISION" || this.state.turn !== 0) {
            return;
        }

        const zone = this.renderer.ZONES?.playerHand || { x: 110, y: 900 };
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;

        const gap = this.renderer.tileGap ?? 2;
        const drawGap = this.renderer.drawGap ?? tileW;

        const startX = zone.x;
        const startY = zone.y;

        const isTsumoState = (player.tepai.length % 3 === 2);
        const lastIndex = player.tepai.length - 1;

        for (let i = 0; i < player.tepai.length; i++) {
            let x = startX + i * (tileW + gap);

            if (isTsumoState && i === lastIndex) {
                x += drawGap;
            }

            const y = startY;

            if (this._hit(px, py, x, y, tileW, tileH)) {
                console.log("[Hand Click] discard index:", i);
                this.state.playerDiscard(0, i);
                return;
            }
        }
    }

    /* ======================
       工具：矩形碰撞檢測
       ====================== */
    _hit(px, py, x, y, w, h) {
        return px >= x && px <= x + w && py >= y && py <= y + h;
    }
}
