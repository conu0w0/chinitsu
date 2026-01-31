import { RESULT_STATE, ResultStateMachine } from "./ResultStateMachine.js";
import { ResultLayout } from "./ResultLayout.js";
import { ResultEffect } from "./ResultEffect.js";
import { ResultCache } from "./ResultCache.js";

export class ResultRenderer {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;

        this.stateMachine = new ResultStateMachine();
        this.layout = new ResultLayout(renderer);
        this.effect = new ResultEffect(renderer);
        this.cache = new ResultCache();

        // 其他原本的初始化，例如 TIMING、YAKU_ORDER 等
    }

    draw(result) {
        if (!result) return;
        this.ctx.save();
        this.ctx.fillStyle = "rgba(0,0,0,0.92)";
        this.ctx.fillRect(0,0,this.r.canvas.width,this.r.canvas.height);

        // 初始化快取/動畫狀態
        if (this._lastResultRef !== result) {
            this._lastResultRef = result;
            this.cache.set(result, this.YAKU_ORDER, this.YAKUMAN_SET);
            // 其他動畫狀態初始化
        }

        // 分流 drawChombo / drawRyuukyoku / drawAgari
        if (result.type === "chombo") this.drawChombo(result);
        else if (result.type === "ryuukyoku") this.drawRyuukyoku(result);
        else this.drawAgari(result);

        this.ctx.restore();
    }

    drawChombo(result) {
        // 使用 this.layout.drawResultHand / drawWaitList
    }

    drawRyuukyoku(result) {
        // 使用 this.layout.drawStaticHand / drawWaitList
    }

    drawAgari(result) {
        // 使用 this.effect.fadeInText / stampText / diagonalHighlight
        // 使用 this.layout.layoutScoreRow / drawResultHand
        // 控制 RESULT_STATE 流程
    }

    _enterState(state) {
        this.stateMachine.enter(state);
    }
}
