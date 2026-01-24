/**
 * main.js
 * 遊戲啟動入口
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");

        this.BASE_SIZE = 1024;
        this.canvas.width = this.BASE_SIZE;
        this.canvas.height = this.BASE_SIZE;

        this.assets = {};
        this.state = new GameState();
        this.renderer = null;
        this.input = null;

        window.addEventListener("resize", () => this.resize());
    }

    async loadAssets() {
        console.log("正在加載資源...");
        
        const loadImage = (src) =>
            new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = src;
            });

        this.assets = {
            table: await loadImage("assets/images/table.jpg"),
            back: await loadImage("assets/images/back.png"),
            tiles: []
        };

        for (let i = 0; i < 9; i++) {
            this.assets.tiles[i] = await loadImage(
                `assets/images/${i + 1}s.png`
            );
        }
        console.log("資源加載完畢...");
    }

    async start() {
        await this.loadAssets();

        this.renderer = new Renderer(this.canvas, this.assets);
        this.input = new InputHandler(this.canvas, this.state, this.renderer);

        this.state.initKyoku(0);

        this.resize();
        this.gameLoop();
    }

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

    gameLoop() {
        this.renderer.render(this.state);
        updateUI(this.state);
        requestAnimationFrame(() => this.gameLoop());
    }
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
        btn.onclick = () => {
            console.log("UI click:", label);
            e.stopPropagation();
            state.applyAction(0, action);
        };
        ui.appendChild(btn);
    };

    if (actions.canTsumo) addBtn("自摸", { type: "TSUMO" });
    if (actions.canRon) addBtn("榮和", { type: "RON" });
    if (actions.canRiichi) addBtn("立直", { type: "RIICHI" });
    if (actions.canAnkan) addBtn("槓", { type: "ANKAN" });
    if (actions.canCancel) addBtn("取消", { type: "CANCEL" });
}

/* ======================
   啟動
   ====================== */
window.onload = () => {
    const game = new MahjongGame();
    game.start();
};
