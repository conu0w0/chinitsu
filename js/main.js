/**
 * main.js
 */

import { GameState } from "./core/gameState.js";
import { Renderer } from "./ui/renderer.js";
import { InputHandler } from "./ui/inputHandler.js";

class MahjongGame {
    constructor() {
        this.canvas = document.getElementById("gameCanvas");
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
            table: await loadImage("assets/images/table.png"),
            back: await loadImage("assets/images/back.png"),
            tiles: []
        };

        // 索子 1~9
        for (let i = 0; i <= 8; i++) {
            this.assets.tiles[i] = await loadImage(
                `assets/images/tiles/${i+1}s.png`
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
