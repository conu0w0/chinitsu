/**
 * main.js
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
        this.canvas.width = 1024;
        this.canvas.height = 1024;
        this.assets = {};
        this.state = new GameState();
        this.renderer = null;
        this.input = null;
    }

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

        // 索子 1~9
        for (let i = 0; i <= 8; i++) {
            this.assets.tiles[i] = await loadImage(
                `assets/images/${i+1}s.png`
            );
        }

        console.log("資源載入完成");
    }

    async start() {
        await this.loadAssets();

        this.renderer = new Renderer(this.canvas, this.assets);
        this.input = new InputHandler(this.canvas, this.state, this.renderer);

        this.state.initKyoku(0);

        this.gameLoop();
    }

    gameLoop() {
        this.renderer.render(this.state);
        requestAnimationFrame(() => this.gameLoop());
    }
}

window.onload = () => {
    new MahjongGame().start();
};

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
    if (actions.canAnkan) addBtn("暗槓", { type: "ANKAN" });
    if (actions.canCancel) addBtn("取消", { type: "CANCEL" });
}

