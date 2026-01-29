/**
 * main.js
 * 遊戲啟動入口
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

// ==========================================
// 測試/作弊工具 (支援 LocalStorage 儲存)
// ==========================================

// 1. 定義預設值
const DEFAULT_CONFIG = {
    enabled: false,
    playerHand: [],
    comHand: [],
    nextDraws: []
};

// 2. 嘗試從 LocalStorage 讀取舊的設定
const savedConfig = localStorage.getItem("MAJSOUL_CHEAT_CONFIG");
window.TEST_CONFIG = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

// 如果讀出來是開啟的，印個提醒
if (window.TEST_CONFIG.enabled) {
    console.log("偵測到已儲存的作弊設定，目前為開啟狀態！", window.TEST_CONFIG);
}

// 3. 設定指令
window.setTest = function(pTilesStr, cTilesStr = "random", drawStr = "") {
    // 解析函數
    const parse = (str) => {
        if (!str || str === "random") return null;
        return str.split('').map(d => parseInt(d) - 1).filter(n => !isNaN(n) && n >= 0 && n <= 8);
    };

    // 更新 Config
    window.TEST_CONFIG = {
        enabled: false,
        playerHand: parse(pTilesStr),
        comHand: parse(cTilesStr),
        nextDraws: parse(drawStr)
    };
    
    localStorage.setItem("MAJSOUL_CHEAT_CONFIG", JSON.stringify(window.TEST_CONFIG));
    
    console.log("作弊模式已儲存！", window.TEST_CONFIG);
};

// 4. 關閉指令
window.disableTest = function() {
    window.TEST_CONFIG = { ...DEFAULT_CONFIG };
    localStorage.removeItem("MAJSOUL_CHEAT_CONFIG");
    console.log("作弊設定已清除，回復隨機發牌！");
};

// ==========================================
// 遊戲主程式
// ==========================================
class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.BASE_SIZE = 1024;
        this.canvas.width = this.BASE_SIZE;
        this.canvas.height = this.BASE_SIZE;

        this.assets = {};
        this.state = null;
        this.renderer = null;
        this.input = null;
    }

    async loadAssets() {
        console.log("正在加載資源...");
        const loadImage = (src) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`[資源缺失] ${src}`);
                resolve(null);
            };
            img.src = src;
        });

        const paths = {
            table: "assets/images/table.jpg",
            back: "assets/images/back.png",
            tiles: Array.from({ length: 9 }, (_, i) => `assets/images/${i + 1}s.png`)
        };

        const [table, back, ...tiles] = await Promise.all([
            loadImage(paths.table),
            loadImage(paths.back),
            ...paths.tiles.map(p => loadImage(p))
        ]);

        this.assets = { table, back, tiles };
        console.log("資源加載完畢！");
    }

    async start() {
        await this.loadAssets();

        this.state = new GameState();
        this.renderer = new Renderer(this.canvas, this.state, this.assets);
        this.input = new InputHandler(this.canvas, this.state, this.renderer);

        // 初始化第一局
        this.state.initKyoku(0);

        this.loop();
        
        // Debug 用：掛載遊戲實體
        window.game = this;
    }

    loop() {
        this.renderer.draw();        
        requestAnimationFrame(() => this.loop());
    }
}

// ==========================================
// 啟動
// ==========================================
window.onload = () => {
    const game = new MahjongGame();
    game.start();
};
