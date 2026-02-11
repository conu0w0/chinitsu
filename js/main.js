/**
 * main.js
 * 遊戲啟動入口 - 最終整合版
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

// ==========================================
// 測試/作弊工具 (支援 LocalStorage 儲存)
// ==========================================

const DEFAULT_CONFIG = {
    enabled: false,
    playerHand: [],
    comHand: [],
    nextDraws: []
};

const savedConfig = localStorage.getItem("MAJSOUL_CHEAT_CONFIG");
window.TEST_CONFIG = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

if (window.TEST_CONFIG.enabled) {
    console.log("🦊 [Cheat] 碼牌模式已啟用:", window.TEST_CONFIG);
}

/**
 * 指令範例：setTest("1234567891122") -> 設定玩家起手
 */
window.setTest = function(pTilesStr, cTilesStr = "random", drawStr = "", enableNow = true) {
    const parse = (str) => {
        if (!str || str === "random") return null;
        return str.split('').map(d => parseInt(d) - 1).filter(n => !isNaN(n) && n >= 0 && n <= 8);
    };

    window.TEST_CONFIG = {
        enabled: enableNow,
        playerHand: parse(pTilesStr),
        comHand: parse(cTilesStr),
        nextDraws: parse(drawStr)
    };
    
    localStorage.setItem("MAJSOUL_CHEAT_CONFIG", JSON.stringify(window.TEST_CONFIG));
    console.log("✅ 作弊模式已更新並儲存！請重新整理頁面生效。");
};

window.disableTest = function() {
    window.TEST_CONFIG = { ...DEFAULT_CONFIG };
    localStorage.removeItem("MAJSOUL_CHEAT_CONFIG");
    console.log("🚫 作弊設定已清除。");
};

// ==========================================
// 遊戲主程式
// ==========================================
class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.container = this.canvas.parentElement; // #game-container
        this.BASE_SIZE = 1024;

        this.assets = {};
        this.state = null;
        this.renderer = null;
        this.input = null;

        this._resizeObserver = null;
        this._lastCssSize = 0;
        this._lastDpr = 0;
    }

    _setupCanvasDPR() {
        const rect = this.container.getBoundingClientRect();

        // 取正方形：跟你 CSS min(95vw,95vh) 對齊
        const cssSize = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
        const dpr = Math.max(1, window.devicePixelRatio || 1);

        if (cssSize === this._lastCssSize && dpr === this._lastDpr) return;
        this._lastCssSize = cssSize;
        this._lastDpr = dpr;

        // canvas 在頁面上的實際顯示尺寸（CSS px）
        this.canvas.style.width = `${cssSize}px`;
        this.canvas.style.height = `${cssSize}px`;

        // canvas 內部像素尺寸（真解析度）
        this.canvas.width = Math.floor(cssSize * dpr);
        this.canvas.height = Math.floor(cssSize * dpr);

        // 讓 renderer / input 知道目前縮放資訊（你可以挑一種）
        if (this.renderer?.setViewport) {
        this.renderer.setViewport({ cssSize, dpr, baseSize: this.BASE_SIZE });
        }
        if (this.input?.setViewport) {
        this.input.setViewport({ cssSize, dpr, baseSize: this.BASE_SIZE });
        }
    }

    async loadAssets() {
        console.log("📦 正在加載資源...");
        
        try {
            // 載入字體
            await document.fonts.load("bold 24px 'M PLUS Rounded 1c'");
            await document.fonts.load("24px 'M PLUS Rounded 1c'");
        } catch (err) {
            console.warn("⚠️ 字體載入失敗，使用系統預設字體。");
        }
        
        const loadImage = (src) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`❌ [資源缺失] ${src}`);
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
        console.log("✨ 資源加載完畢！");
    }

    async start() {
        await this.loadAssets();

        // 1. 初始化邏輯與渲染器
        this.state = new GameState();
        this.renderer = new Renderer(this.canvas, this.state, this.assets);
        this.input = new InputHandler(this.canvas, this.state, this.renderer);
        
        // 2. DPR 設定
        this._setupCanvasDPR();
        this._resizeObserver = new ResizeObserver(() => this._setupCanvasDPR());
        this._resizeObserver.observe(this.container);
        window.addEventListener("resize", () => this._setupCanvasDPR(), { passive: true });

        // 3. 啟動第一局，進入主迴圈
        this.state.startGame();
        this.loop();
        
        window.game = this;
    }

    /**
     * 遊戲主循環
     */
    loop() {
        // A. 處理邏輯層拋出的事件動畫
        this._processGameStateActions();

        // B. 更新物理/動畫狀態 (Lerp 座標、翻牌偵測、分數跳動)
        if (this.renderer) {
            this.renderer._updateState();
        }

        // C. 繪製畫面
        this.renderer.draw(); 
               
        requestAnimationFrame(() => this.loop());
    }

    /**
     * 動畫橋接器：監聽 GameState 的變化並轉化為視覺動畫
     */
    _processGameStateActions() {
        // 使用 lastAction 作為簡單的事件匯流排
        const action = this.state.lastAction;
        if (!action) return;

        switch (action.type) {
            case "com_tease":
                // 觸發 COM 的彈起動畫
                this.renderer.animations.push({
                    type: "discard_tease",
                    isCom: true,
                    index: action.index,
                    startTime: performance.now(),
                    duration: 400
                });
                break;

            case "deal_batch":
                // 若有特定的配牌動畫需求可在此擴充
                break;
        }

        // 處理完後清空，避免 loop 重複觸發同一事件
        this.state.lastAction = null;
    }
}

// ==========================================
// 啟動啟動！
// ==========================================
window.onload = () => {
    const game = new MahjongGame();
    game.start();
};
