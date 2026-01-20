/**
 * main.js
 * 遊戲啟動點：負責資源載入、對象組裝與主循環 (Game Loop)
 */

import { GameState } from './core/GameState.js';
import { Renderer } from './ui/Renderer.js';
import { InputHandler } from './ui/InputHandler.js';

class MahjongGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.assets = {};
        this.isLoaded = false;

        // 1. 初始化核心邏輯與渲染器
        this.state = new GameState();
        // 我們先預設一個 Renderer，等圖片載入完再傳入 assets
        this.renderer = null; 
        this.input = null;
    }

    /**
     * 載入資源 (麻將牌圖片等)
     */
    async loadAssets() {
        const loadImage = (src) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = src;
            });
        };

        console.log("正在載入資源...");
        // 這裡的路徑需對應你 GitHub 專案的 assets 資料夾
        // 假設你有一張合併好的牌面圖 pai.png
        this.assets.tiles = await loadImage('assets/images/pai.png');
        
        this.isLoaded = true;
        console.log("資源載入完成");
    }

    /**
     * 啟動遊戲
     */
    async start() {
        await this.loadAssets();

        // 2. 實例化渲染器與輸入處理器
        this.renderer = new Renderer(this.canvas, this.assets);
        this.input = new InputHandler(this.canvas, this.state, this.renderer);

        // 3. 初始化第一局 (東風場, 玩家 0 是莊家)
        this.state.initKyoku(27, 0);

        // 4. 開始遊戲循環
        this.gameLoop();
    }

    /**
     * 遊戲主循環
     */
    gameLoop() {
        // 更新畫面
        this.renderer.render(this.state);

        // 使用 requestAnimationFrame 保持流暢度
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 網頁載入後啟動
window.onload = () => {
    const game = new MahjongGame();
    game.start();
};
