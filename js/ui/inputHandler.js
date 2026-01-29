/**
 * inputHandler.js
 * 處理滑鼠點擊輸入，並呼叫 GameState 對應方法
 */
export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;
        
        // 綁定點擊事件
        this.canvas.addEventListener("click", (e) => this._onCanvasClick(e));
    }

    /* ======================
       處理 Canvas 點擊 (統一入口)
       ====================== */
    _onCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        
        // 處理 Canvas縮放 (如果 CSS 尺寸跟 Render 尺寸不同)
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;

        // 1. 遊戲尚未開始 (INIT) -> 點擊開始 (隨機起莊)
        if (this.state.phase === "INIT") {
            this.state.startGame();
            return;
        }

        // 2. 結算畫面 (ROUND_END) -> 點擊下一局 (判定輪莊)
        if (this.state.phase === "ROUND_END") {
            this.state.nextKyoku();
            return;
        }

        // 3. UI 按鈕優先判定 (吃碰槓胡、取消)
        if (this._handleUIButtonClick(px, py)) {
            return;
        }

        // 4. 手牌點擊判定 (切牌)
        this._handlePlayerHandClick(px, py);
    }

    /* ======================
       Canvas UI 按鈕判定
       ====================== */
    _handleUIButtonClick(px, py) {
        const buttons = this.renderer.uiButtons;
        
        // 如果沒有按鈕，直接跳過
        if (!buttons || buttons.length === 0) return false;

        for (const btn of buttons) {
            if (this._hit(px, py, btn.x, btn.y, btn.w, btn.h)) {
                console.log("[Canvas UI] 觸發動作:", btn.action);

                // ★ 點擊後立刻清空按鈕，避免連點
                this.renderer.uiButtons = [];

                // 執行動作
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
        const state = this.state;

        // 檢查是否輪到玩家操作
        if (!this._canPlayerDiscard()) return;

        const player = state.players[0];
        const zone = this.renderer.ZONES.playerHand;

        // 取得渲染參數 (從 Renderer 拿或是用預設值)
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        const gap = this.renderer.tileGap ?? 2;
        const drawGap = this.renderer.drawGap ?? tileW; // 摸牌與手牌的距離
        
        // 判斷是否為摸牌狀態 (14張)
        const isTsumo = (player.tepai.length % 3 === 2);
        const lastIndex = player.tepai.length - 1;

        for (let i = 0; i < player.tepai.length; i++) {
            // 計算每張牌的 X 座標
            let x = zone.x + i * (tileW + gap);
            
            // 如果是摸牌狀態，最後一張要往右推一點
            if (isTsumo && i === lastIndex) {
                x += drawGap;
            }

            // 碰撞檢測
            if (!this._hit(px, py, x, zone.y, tileW, tileH)) continue;

            // === 特殊規則檢查 ===
            
            // 立直後限制：只能切剛摸到的那張牌 (最後一張)
            if (player.isReach) {
                const isTsumoTile = (i === lastIndex);
                if (!isTsumoTile) {
                    console.warn("[Input] 立直中，只能切摸到的牌！");
                    return;
                }
            }

            // 點擊成功 -> 執行切牌
            this.renderer.uiButtons = []; // 切牌時隱藏所有 UI
            state.playerDiscard(0, i);
            return;
        }
    }

    /* ======================
       工具
       ====================== */
    
    // 矩形碰撞檢測
    _hit(px, py, x, y, w, h) {
        return px >= x && px <= x + w && py >= y && py <= y + h;
    }

    // 檢測能否出牌
    _canPlayerDiscard() {
        const state = this.state;
        
        // 必須輪到玩家 (Turn 0)
        if (state.turn !== 0) return false;

        // 必須是以下階段才能切牌
        return (
            state.phase === "PLAYER_DECISION" ||  // 一般出牌
            state.phase === "DISCARD_ONLY" ||     // 取消特殊動作後
            state.phase === "RIICHI_DECLARATION"  // 立直宣言後需要切牌
        );
    }
}
