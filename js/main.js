/**
 * main.js
 * 遊戲啟動入口
 * 負責：載入資源 -> 初始化模組 -> 啟動迴圈
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");

        // 設定 Canvas 內部解析度 (邏輯解析度)
        // 實際顯示大小由 CSS 控制
        this.BASE_SIZE = 1024;
        this.canvas.width = this.BASE_SIZE;
        this.canvas.height = this.BASE_SIZE;

        this.assets = {};
        this.state = null;
        this.renderer = null;
        this.input = null;
    }

    /* ======================
       1. 資源載入 (平行處理 + 錯誤防護)
       ====================== */
    async loadAssets() {
        console.log("正在加載資源...");

        const loadImage = (src) =>
            new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => {
                    console.warn(`[資源缺失] 無法載入: ${src} (將使用替代色塊)`);
                    resolve(null); // 失敗回傳 null，讓 Renderer 畫色塊
                };
                img.src = src;
            });

        // 定義圖片路徑
        const paths = {
            table: "assets/images/table.jpg",
            back: "assets/images/back.png",
            // 產生 1s.png ~ 9s.png
            tiles: Array.from({ length: 9 }, (_, i) => `assets/images/${i + 1}s.png`)
        };

        // 平行載入所有圖片
        const [table, back, ...tiles] = await Promise.all([
            loadImage(paths.table),
            loadImage(paths.back),
            ...paths.tiles.map(p => loadImage(p))
        ]);

        this.assets = { table, back, tiles };
        console.log("資源加載完畢！");
    }

    /* ======================
       2. 遊戲啟動
       ====================== */
    async start() {
        // 1. 等待圖片載入
        await this.loadAssets();

        // 2. 初始化核心 (Level 1)
        this.state = new GameState();

        // 3. 初始化繪圖 (Level 2) - 傳入 state 和 assets
        this.renderer = new Renderer(this.canvas, this.state, this.assets);

        // 4. 初始化輸入 (Level 3) - 傳入 renderer 以獲取座標參數
        this.input = new InputHandler(this.canvas, this.state, this.renderer);

        // 5. 開始一局 (0 = 玩家起家)
        this.state.initKyoku(0);

        // 6. 啟動渲染迴圈
        this.loop();
        
        // Debug 用：掛載到 window 方便 Console 測試
        window.game = this;
    }

    /* ======================
       3. 遊戲迴圈
       ====================== */
    loop() {
        // Renderer 內部現在會處理：背景、牌、資訊、以及 UI 生成
        this.renderer.draw();        
        requestAnimationFrame(() => this.loop());
    }
}

/* ======================
   入口點
   ====================== */
window.onload = () => {
    const game = new MahjongGame();
    game.start();
};
