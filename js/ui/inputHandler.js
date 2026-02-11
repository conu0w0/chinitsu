/**
 * inputHandler.js
 * 負責處理 Canvas 的滑鼠交互
 * 同步 Renderer 的物理座標，確保理牌動畫中點擊依然精準
 */
export class InputHandler {
    constructor(canvas, state, renderer) {
        this.canvas = canvas;
        this.state = state;
        this.renderer = renderer;
        this.baseSize = 1024;

        this._setupEventListeners();
    }

    setViewport({ baseSize }) {
        this.baseSize = baseSize;
    }

    _setupEventListeners() {
        // 讓手機觸控不被瀏覽器當成捲動/雙指縮放
        this.canvas.style.touchAction = "none";

        this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
        this.canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
        this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
        this.canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));
        this.canvas.addEventListener("pointerleave", () => {
            this.renderer.isHandPressed = false;
            this.renderer.pressedButtonIndex = -1;
            this.renderer.hoveredIndex = -1;
        });
    }


    /* =================================================================
       Event Handlers
       ================================================================= */

    _onMouseDown(event) {
        const { x, y } = this._getMousePos(event);
        const buttons = this.renderer.uiButtons || [];

        // 1. 檢查 UI 按鈕按下
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (this._hit(x, y, btn.x, btn.y, btn.w, btn.h)) {
                this.renderer.pressedButtonIndex = i;
                return;
            }
        }

        // 2. 檢查手牌按下 (單純為了視覺回饋)
        this._handleHandDownEffect(x, y);
    }

    _onMouseUp(event) {
        const { x, y } = this._getMousePos(event);
        const pressedBtnIndex = this.renderer.pressedButtonIndex;
        this.renderer.pressedButtonIndex = -1;
        this.renderer.isHandPressed = false; // 重置手牌按壓視覺

        switch (this.state.phase) {
            case "INIT":
                this.state.startGame();
                break;
            case "ROUND_END":
                this._handleRoundEndPhase();
                break;
            default:
                this._handleInGameInteract(x, y, pressedBtnIndex);
                break;
        }
    }

    _onMouseMove(event) {
        const { x, y } = this._getMousePos(event);
        this._handleHandHover(x, y);
    }


    _onPointerDown(e) {
        if (e.button !== undefined && e.button !== 0) return;
        this.canvas.setPointerCapture?.(e.pointerId);
        this._onMouseDown(e);
    }

    _onPointerUp(e) {
        this.canvas.releasePointerCapture?.(e.pointerId);
        this._onMouseUp(e);
    }

    _onPointerMove(e) {
        this._onMouseMove(e);
    }



    /* =================================================================
       Core Logic
       ================================================================= */

    _handleInGameInteract(x, y, pressedBtnIndex) {    
        const buttons = this.renderer.uiButtons || [];
        let uiTriggered = false;
        
        if (pressedBtnIndex !== -1 && buttons[pressedBtnIndex]) {
            const btn = buttons[pressedBtnIndex];
            if (this._hit(x, y, btn.x, btn.y, btn.w, btn.h)) {
                this.renderer.uiButtons = []; 
                this.state.applyAction(0, btn.action);
                uiTriggered = true;
            }
        }
        
        if (!uiTriggered) this._handleHandTileClick(x, y);
    }

    /**
     * 【核心改進】使用物理座標進行碰撞檢測
     */
    _handleHandTileClick(px, py) {
        if (!this._canPlayerDiscard()) return;

        const player = this.state.players[0];
        const zone = this.renderer.ZONES.playerHand;
        const { tileW, tileH } = this._getHandRenderParams();
        
        // 從 Renderer 獲取當前牌張的實際物理位置 (currentXs)
        const physics = this.renderer.handPhysics.player;

        for (let i = 0; i < player.tepai.length; i++) {
            // 與繪製位置完全同步，理牌中也能精準點擊
            const x = physics.currentXs[i]; 

            if (this._hit(px, py, x, zone.y, tileW, tileH)) {
                // 立直規則檢查
                if (player.isReach && i !== player.tepai.length - 1) {
                    console.warn("立直中只能切摸到的牌嗷！");
                    return;
                }

                this.renderer.uiButtons = [];
                this.state.playerDiscard(0, i);
                return;
            }
        }
    }

    _handleHandHover(px, py) {
        let hoveredIndex = -1;
        if (this._canPlayerDiscard()) {
            const player = this.state.players[0];
            const zone = this.renderer.ZONES.playerHand;
            const { tileW, tileH } = this._getHandRenderParams();
            const physics = this.renderer.handPhysics.player;

            for (let i = 0; i < player.tepai.length; i++) {
                const x = physics.currentXs[i];
                // Hover 判定稍微加寬高度，操作更舒服
                if (this._hit(px, py, x, zone.y - 30, tileW, tileH + 30)) {
                    hoveredIndex = i;
                    break;
                }
            }
        }
        this.renderer.hoveredIndex = hoveredIndex;
    }

    /**
     * 視覺回饋：按下時讓牌稍微下沈
     */
    _handleHandDownEffect(px, py) {
        if (!this._canPlayerDiscard()) return;
        const player = this.state.players[0];
        const zone = this.renderer.ZONES.playerHand;
        const { tileW, tileH } = this._getHandRenderParams();
        const physics = this.renderer.handPhysics.player;

        for (let i = 0; i < player.tepai.length; i++) {
            if (this._hit(px, py, physics.currentXs[i], zone.y, tileW, tileH)) {
                this.renderer.isHandPressed = true; // Renderer 可據此調整 y 偏移
                return;
            }
        }
    }

    _handleRoundEndPhase() {
        const res = this.renderer.resultRenderer;
        if (!res) return;

        const stage = this.state.resultClickStage;

        if (stage === 0 && res.isReadyForNext) {
            this.state.resultClickStage = 1;
            this.state.applyResultPoints();
        } else if (stage === 1) {
            const finalPoints = this.state.players.map(p => p.points);
            this.renderer.visualPoints = [...finalPoints];
            this.state.resultClickStage = 2;
        } else if (stage === 2) {
            res._resetAnimationState();
            this.renderer.animations = [];
            this.state.nextKyoku();
        }
    }

    /* =================================================================
       Helpers
       ================================================================= */

    _getMousePos(event) {
        const rect = this.canvas.getBoundingClientRect();
        const base = this.baseSize || 1024;

        return {
            x: (event.clientX - rect.left) * (base / rect.width),
            y: (event.clientY - rect.top) * (base / rect.height),
        };
    }


    _hit(px, py, x, y, w, h) {
        return px >= x && px <= x + w && py >= y && py <= y + h;
    }

    _canPlayerDiscard() {
        const s = this.state;
        return s.turn === 0 && ["PLAYER_DECISION", "DISCARD_ONLY", "RIICHI_DECLARATION"].includes(s.phase);
    }

    _getHandRenderParams() {
        return {
            tileW: this.renderer.config.tile.w,
            tileH: this.renderer.config.tile.h
        };
    }
}