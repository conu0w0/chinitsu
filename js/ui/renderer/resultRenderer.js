export class ResultRenderer {
    constructor(renderer) {
        this.r = renderer;        // 主 Renderer（共用 ctx / assets）
        this.ctx = renderer.ctx;
        this.gameState = renderer.gameState;
    }

    draw(result) {
        if (!result) return;

        if (result.type === "chombo") {
            this.drawChombo(result);
        } else if (result.type === "ryuukyoku") {
            this.drawRyuukyoku(result);
        } else {
            this.drawAgari(result);
        }
    }

    drawChombo(result) {
        // ⬅️ 把 drawResult 裡 A. 錯和 的整段搬過來
    }

    drawRyuukyoku(result) {
        // ⬅️ B. 流局
    }

    drawAgari(result) {
        // ⬅️ C. 和牌
    }
}
