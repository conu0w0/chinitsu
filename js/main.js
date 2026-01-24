/**
 * main.js
 * 遊戲啟動入口（Canvas-only 版本）
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");

        // 邏輯畫布尺寸（固定）
        this.BASE_SIZE = 1024;
        this.canvas.width = this.BASE_SIZE;
        this.canvas.height = this.BASE_SIZE;

        this.assets = {};
        this.state = new GameState();
        this.renderer = null;
        this.input = null;

        window.addEventListener("resize", () => this.resize());
    }

    /* ======================
       載入資源
       ====================== */
    async loadAssets() {
        const loadImage = (src) =>
            new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = src;
            });

        console.log("正在載入資源...");

        this.assets = {
            table: await loadImage("assets/images/table.jpg"),
            back: await loadImage("assets/images/back.png"),
            tiles: []
        };

        // 索子 1s ~ 9s
        for (let i = 0; i < 9; i++) {
            this.assets.tiles[i] = await loadImage(
                `assets/images/${i + 1}s.png`
            );
        }

        console.log("資源載入完成");
    }

    /* ======================
       開始新一局
       ====================== */
    async start() {
        await this.loadAssets();

        this.renderer = new Renderer(this.canvas, this.assets);
        this.input = new InputHandler(this.canvas, this.state, this.renderer);

        // 開始一局（親家 = 玩家）
        this.state.initKyoku(0);

        this.resize();
        this.gameLoop();
    }

    /* ======================
       Resize（純視覺縮放）
       ====================== */
    resize() {
        const scale = Math.min(
            window.innerWidth / this.BASE_SIZE,
            window.innerHeight / this.BASE_SIZE
        );

        this.canvas.style.transform = `
            translate(-50%, -50%)
            scale(${scale})
        `;
    }

    /* ======================
       UI Overlay
       ====================== */
    function updateUI(state) {
        const ui = document.getElementById("ui-overlay");
        ui.innerHTML = "";

        const actions = state.getLegalActions(0);

        const addBtn = (label, action) => {
            const btn = document.createElement("button");
            btn.className = "ui-btn";
            btn.textContent = label;
            btn.onclick = () => state.applyAction(0, action);
            ui.appendChild(btn);
        };

        if (actions.canTsumo) addBtn("自摸", { type: "TSUMO" });
        if (actions.canRon) addBtn("榮和", { type: "RON" });
        if (actions.canRiichi) addBtn("立直", { type: "RIICHI" });
        if (actions.canAnkan) addBtn("槓", { type: "ANKAN" });
        if (actions.canCancel) addBtn("取消", { type: "CANCEL" });
    }

    /* ======================
       主循環
       ====================== */
    gameLoop() {
            this.renderer.render(this.state);
            updateUI(this.state); 
            requestAnimationFrame(() => this.gameLoop());
        }
    }

    /* ======================
       啟動
       ====================== */
    window.onload = () => {
        const game = new MahjongGame();
        game.start();
    };
