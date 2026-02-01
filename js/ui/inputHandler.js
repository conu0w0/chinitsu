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
        
        // 追蹤移動事件
        this.canvas.addEventListener("mousemove", (e) => this._onCanvasMove(e));
    }

    /* ======================
       處理 Canvas 點擊
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
            const res = this.renderer.resultRenderer;
            
            // A. 階段 0：文字動畫跑完後，點擊進入「增減動畫」
            if (this.state.resultClickStage === 0) {
                if (res.isReadyForNext) { 
                    this.state.resultClickStage = 1; // 進入動畫階段
                    this.state.applyResultPoints();  // 雖然點數變了，但 Renderer 會跑動畫慢慢追
                    console.log("嗷嗚！役種確認完畢，點數移動！");
                }
                return;
            }
            
            // B. 階段 1：正在跳數字中，點擊可直接跳過動畫
            if (this.state.resultClickStage === 1) {
                this.renderer.visualPoints = this.state.players.map(p => p.points);
                this.state.resultClickStage = 2; // 直接解鎖下一局點擊
                console.log("嗷嗚！跳過動畫，直接看結果！");
                return;
            }
            
            // C. 階段 2：動畫結束了，再次點擊進入下一局
            if (this.state.resultClickStage === 2) {
                res._resetAnimationState()
                this.renderer.animations = [];
                
                this.state.nextKyoku();
            }
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
       偵測游標移動
       ====================== */    
    // 新增滑鼠移動處理
    _onCanvasMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const px = (event.clientX - rect.left) * scaleX;
        const py = (event.clientY - rect.top) * scaleY;
        
        // 檢查是否指著手牌
        const player = this.state.players[0];
        const zone = this.renderer.ZONES.playerHand;
        const tileW = this.renderer.tileWidth;
        const tileH = this.renderer.tileHeight;
        const gap = this.renderer.tileGap;
        const drawGap = this.renderer.drawGap;
        
        const isTsumo = (player.tepai.length % 3 === 2);
        let hoveredIndex = -1;
        
        // 只有玩家能出牌的階段才計算 Hover
        if (this._canPlayerDiscard()) {
            for (let i = 0; i < player.tepai.length; i++) {
                let x = zone.x + i * (tileW + gap);
                if (isTsumo && i === player.tepai.length - 1) x += drawGap;
                
                // 這裡判定 y 稍微往下偏移一點，避免彈起時滑鼠滑出判定區
                if (this._hit(px, py, x, zone.y - 20, tileW, tileH + 20)) {
                    hoveredIndex = i;
                    break;
                }
            }
        }
        
        // 將選中的 Index 傳回給 Renderer
        this.renderer.hoveredIndex = hoveredIndex;
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
