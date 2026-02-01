/**
 * inputHandler.js
 * 負責處理 Canvas 的滑鼠交互 (點擊、移動、按壓狀態)
 * 並將操作轉發給 GameState 或 Renderer
 */
export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;

        this._setupEventListeners();
    }

    /**
     * 初始化事件監聽
     */
    _setupEventListeners() {
        // 1. 按下：記錄按壓狀態 (UI 按鈕回饋)
        this.canvas.addEventListener("mousedown", (e) => this._onMouseDown(e));

        // 2. 彈起：主要邏輯觸發點 (確認點擊有效)
        this.canvas.addEventListener("mouseup", (e) => this._onMouseUp(e));

        // 3. 移動：Hover 效果與提示
        this.canvas.addEventListener("mousemove", (e) => this._onMouseMove(e));

        // 4. 離開：清除所有暫存狀態 (避免滑鼠按著拖出去後卡住)
        this.canvas.addEventListener("mouseleave", () => {
            this.renderer.pressedButtonIndex = -1;
            this.renderer.hoveredIndex = -1;
        });
    }

    /* =================================================================
       Event Handlers (事件入口)
       ================================================================= */

    _onMouseDown(event) {
        const { x, y } = this._getMousePos(event);
        const buttons = this.renderer.uiButtons || [];

        // 檢查是否按下 UI 按鈕
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (this._hit(x, y, btn.x, btn.y, btn.w, btn.h)) {
                this.renderer.pressedButtonIndex = i; // 通知 Renderer 繪製「按下」效果
                return;
            }
        }
    }

    _onMouseUp(event) {
        const { x, y } = this._getMousePos(event);
        
        // 1. 總是先重置按壓狀態
        const pressedBtnIndex = this.renderer.pressedButtonIndex;
        this.renderer.pressedButtonIndex = -1;

        // 2. 根據遊戲階段分流處理
        switch (this.state.phase) {
            case "INIT":
                this._handleInitPhase();
                break;

            case "ROUND_END":
                this._handleRoundEndPhase();
                break;

            default:
                // 3. 遊戲進行中：處理 UI 按鈕或手牌點擊
                this._handleInGameInteract(x, y, pressedBtnIndex);
                break;
        }
    }

    _onMouseMove(event) {
        const { x, y } = this._getMousePos(event);
        
        // 處理手牌 Hover 效果
        this._handleHandHover(x, y);
    }

    /* =================================================================
       Phase Handlers (各階段邏輯)
       ================================================================= */

    /**
     * 階段：INIT (遊戲尚未開始)
     */
    _handleInitPhase() {
        this.state.startGame();
    }

    /**
     * 階段：ROUND_END (單局結算)
     * 處理點數動畫與下一局的切換
     */
    _handleRoundEndPhase() {
        const res = this.renderer.resultRenderer;
        const stage = this.state.resultClickStage;

        // A. 階段 0：文字動畫跑完後，點擊進入「點數增減動畫」
        if (stage === 0) {
            if (res.isReadyForNext) { 
                this.state.resultClickStage = 1;
                this.state.applyResultPoints(); // 更新邏輯點數，Renderer 開始跑動畫
                console.log("嗷嗚！役種確認完畢，點數移動！");
            }
            return;
        }
        
        // B. 階段 1：動畫中，點擊則「跳過動畫」
        if (stage === 1) {
            const finalPoints = this.state.players.map(p => p.points);
            this.renderer.visualPoints = [...finalPoints];             
            if (this.renderer.displayPoints) this.renderer.displayPoints = [...finalPoints];
            this.state.resultClickStage = 2; // 直接跳到「可點擊下一局」的狀態
            console.log("嗷嗚！玩家點擊跳過，點數移動完畢！");
            return;
        }
        
        // C. 階段 2：動畫結束，點擊進入「下一局」
        if (stage === 2) {
            res._resetAnimationState();
            this.renderer.animations = [];
            this.state.nextKyoku();
        }
    }

    /**
     * 階段：遊戲中 (處理 UI 按鈕與手牌交互)
     * @param {number} x 滑鼠 X
     * @param {number} y 滑鼠 Y
     * @param {number} pressedBtnIndex 剛才 MouseDown 的按鈕索引 (用於防呆)
     */
    _handleInGameInteract(x, y, pressedBtnIndex) {
        // 優先權 1：UI 按鈕 (吃、碰、槓、胡、取消)
        // 嚴格判定：必須在同一顆按鈕上「按下」且「放開」才算觸發
        const buttons = this.renderer.uiButtons || [];
        if (pressedBtnIndex !== -1 && buttons[pressedBtnIndex]) {
            const btn = buttons[pressedBtnIndex];
            if (this._hit(x, y, btn.x, btn.y, btn.w, btn.h)) {
                console.log("[Canvas UI] 觸發動作:", btn.action);
                this.renderer.uiButtons = []; // 點擊後清空 UI 防止連點
                this.state.applyAction(0, btn.action);
                return;
            }
        }

        // 優先權 2：點擊手牌 (切牌)
        // 如果剛才沒有點擊任何 UI 按鈕，才檢測手牌
        if (pressedBtnIndex === -1) {
            this._handleHandTileClick(x, y);
        }
    }

    /* =================================================================
       Feature Logics (具體功能邏輯)
       ================================================================= */

    /**
     * 處理手牌點擊 (切牌)
     */
    _handleHandTileClick(px, py) {
        // 1. 權限檢查
        if (!this._canPlayerDiscard()) return;

        const player = this.state.players[0];
        const zone = this.renderer.ZONES.playerHand;
        const { tileW, tileH, gap, drawGap, isTsumo, lastIndex } = this._getHandRenderParams(player);

        // 2. 遍歷手牌檢測碰撞
        for (let i = 0; i < player.tepai.length; i++) {
            let x = zone.x + i * (tileW + gap);
            if (isTsumo && i === lastIndex) x += drawGap; // 摸牌位移

            if (this._hit(px, py, x, zone.y, tileW, tileH)) {
                
                // 3. 特殊規則：立直後只能切摸到的牌
                if (player.isReach && i !== lastIndex) {
                    console.warn("[Input] 立直中，只能切摸到的牌！");
                    return;
                }

                // 4. 執行切牌
                this.renderer.uiButtons = []; // 切牌時隱藏 UI
                this.state.playerDiscard(0, i);
                return;
            }
        }
    }

    /**
     * 處理手牌 Hover (滑鼠移動偵測)
     */
    _handleHandHover(px, py) {
        let hoveredIndex = -1;

        // 只有在玩家能操作時才計算 Hover，節省效能
        if (this._canPlayerDiscard()) {
            const player = this.state.players[0];
            const zone = this.renderer.ZONES.playerHand;
            const { tileW, tileH, gap, drawGap, isTsumo, lastIndex } = this._getHandRenderParams(player);

            for (let i = 0; i < player.tepai.length; i++) {
                let x = zone.x + i * (tileW + gap);
                if (isTsumo && i === lastIndex) x += drawGap;

                // y 軸判定稍微寬容一點 (zone.y - 20, h + 20)
                if (this._hit(px, py, x, zone.y - 20, tileW, tileH + 20)) {
                    hoveredIndex = i;
                    break;
                }
            }
        }

        this.renderer.hoveredIndex = hoveredIndex;
    }

    /* =================================================================
       Helpers (輔助函式)
       ================================================================= */

    /**
     * 取得標準化後的滑鼠座標 (處理 Canvas CSS 縮放)
     */
    _getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    /**
     * 矩形碰撞檢測
     */
    _hit(px, py, x, y, w, h) {
        return px >= x && px <= x + w && py >= y && py <= y + h;
    }

    /**
     * 判斷玩家當前是否允許切牌
     */
    _canPlayerDiscard() {
        const state = this.state;
        if (state.turn !== 0) return false;

        return (
            state.phase === "PLAYER_DECISION" || // 一般回合
            state.phase === "DISCARD_ONLY" ||    // 取消吃碰後
            state.phase === "RIICHI_DECLARATION" // 立直宣言後
        );
    }

    /**
     * 取得手牌渲染參數 (避免在 Loop 中重複解構)
     */
    _getHandRenderParams(player) {
        return {
            tileW: this.renderer.tileWidth,
            tileH: this.renderer.tileHeight,
            gap: this.renderer.tileGap ?? 2,
            drawGap: this.renderer.drawGap ?? this.renderer.tileWidth,
            isTsumo: (player.tepai.length % 3 === 2),
            lastIndex: player.tepai.length - 1
        };
    }
}
