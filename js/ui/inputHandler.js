export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;
        
        // 取得 UI 容器
        this.uiContainer = document.getElementById('ui-overlay');

        // 1. 綁定 Canvas 點擊 (處理手牌/牌桌)
        this.canvas.addEventListener("click", (e) => this._onCanvasClick(e));

        // 2. 綁定 UI 容器點擊 (處理 HTML 按鈕)
        // 使用事件委派：監聽父容器，抓取子按鈕的點擊
        if (this.uiContainer) {
            this.uiContainer.addEventListener("click", (e) => this._onUiClick(e));
        }
    }

    /* ======================
       處理 UI 按鈕點擊 (DOM)
       ====================== */
    _onUiClick(event) {
        // 檢查被點擊的是否為 .ui-btn
        const target = event.target.closest('.ui-btn');
        
        // 如果點到的不是按鈕，就忽略 (例如點到按鈕之間的縫隙)
        if (!target.classList.contains('ui-btn')) {
            return;
        }

        // 從 HTML 屬性中讀取動作 (需要在 Renderer 生成按鈕時寫入 data-type)
        const actionType = target.dataset.type; // 例如 "RON", "TSUMO", "CANCEL"
        const payloadRaw = target.dataset.payload;
        
        if (actionType) {
            let payload = {};
            if (payloadRaw) {
                try {
                    payload = JSON.parse(payloadRaw);
                } catch (e) {
                    console.error("Payload 解析失敗", e);
                }
            }

            console.log(`[UI Input] 觸發動作: ${actionType}`, payload);
            this.state.applyAction(0, { type: actionType, ...payload });
        }
    }

    /* ======================
       處理 Canvas 點擊 (座標)
       ====================== */
    _onCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;

        if (this.state.phase === "ROUND_END") {
            this.state.initKyoku(this.state.parentIndex);
            return;
        }

        this._handlePlayerHandClick(px, py);
    }

    /* ======================
       判定玩家手牌 (含摸牌間距邏輯)
       ====================== */
    _handlePlayerHandClick(px, py) {
        const player = this.state.players[0];
        if (!player) return;

        if (this.state.phase !== "PLAYER_DECISION" || this.state.turn !== 0) {
            return;
        }

        const zone = this.renderer.ZONES?.playerHand || { x: 150, y: 580 };
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        
        const gap = 2; 
        const drawGap = tileW; // 摸牌間距

        const startX = zone.x;
        const startY = zone.y;

        // 判斷是否處於摸牌狀態 (餘數 2 代表剛摸進牌)
        const isTsumoState = (player.tepai.length % 3 === 2);
        const lastIndex = player.tepai.length - 1;

        for (let i = 0; i < player.tepai.length; i++) {
            let x = startX + i * (tileW + gap);

            // 如果是最後一張且處於摸牌狀態，增加間距
            if (isTsumoState && i === lastIndex) {
                x += drawGap;
            }

            const y = startY;

            if (this._hit(px, py, x, y, tileW, tileH)) {
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
