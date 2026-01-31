export class ResultEffect {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
    }

    fadeInText({ text, x, y, font, startTime, duration = 400 }) {
        const ctx = this.ctx;
        const t = Math.min(1, (performance.now() - startTime) / duration);
        ctx.save();
        ctx.font = font;
        ctx.globalAlpha = t;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    stampText({ text, x, y, font, startTime, duration = 500, dropHeight = 40 }) {
        // 原 _drawStampText 內容
    }

    diagonalHighlight({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        // 原 _drawDiagonalHighlightTextOnly 內容
    }
}
