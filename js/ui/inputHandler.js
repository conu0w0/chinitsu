/**
 * InputHandler.js
 * 負責監聽玩家輸入，並將畫面座標轉換為遊戲指令
 */

export class InputHandler {
    /**
     * @param {HTMLCanvasElement} canvas - 遊戲畫布
     * @param {GameState} gameState - 當前的遊戲狀態
     * @param {Renderer} renderer - 繪圖引擎 (用來獲取配置參數)
     */
    constructor(canvas, gameState, renderer) {
        this.canvas = canvas;
        this.state = gameState;
        this.renderer = renderer;

        this.init();
    }

    init() {
        // 支援滑鼠點擊
        this.canvas.addEventListener('mousedown', (e) => this.handleClick(e));
        // 支援觸控
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleClick(e.touches[0]);
        });
    }

    /**
     * 處理點擊邏輯
     */
    handleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // 只有輪到玩家 (Turn 0) 時才處理輸入
        if (this.state.turn !== 0) return;

        // 1. 檢測是否點擊了手牌
        const tileIndex = this.checkTileClick(x, y);
        if (tileIndex !== -1) {
            console.log(`玩家點擊了第 ${tileIndex} 張牌`);
            this.state.playerDiscard(0, tileIndex); // 執行打牌動作
            return;
        }

        // 2. 檢測是否點擊了功能按鈕 (例如: 吃、碰、槓、立直)
        this.checkButtonClick(x, y);
    }

    /**
     * 判定點擊座標是否在玩家的手牌範圍內
     * @returns {number} 返回牌的索引，沒點中則返回 -1
     */
    checkTileClick(x, y) {
        const config = this.renderer.config;
        const player = this.state.players[0];
        const numTiles = player.tepai.length;

        // 這裡的座標計算要對應 Renderer.js 中的 setupPlayerTransform(0)
        // 假設玩家手牌起始座標為 (startX, startY)
        const startX = this.canvas.width / 2 - 200;
        const startY = this.canvas.height - 80;

        for (let i = 0; i < numTiles; i++) {
            const tx = startX + i * config.tileW;
            const ty = startY;

            if (x >= tx && x <= tx + config.tileW &&
                y >= ty && y <= ty + config.tileH) {
                return i;
            }
        }
        return -1;
    }

    /**
     * 檢測功能按鈕 (吃碰槓) 的點擊
     */
    checkButtonClick(x, y) {
        // 這部分邏輯可以根據 UI 設計擴充
        // 例如：當可執行動作時，Renderer 會畫出按鈕
        // 這裡檢查座標是否落在按鈕矩形內
    }
}
