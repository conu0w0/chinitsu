export class ResultLayout {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
    }

    layoutScoreRow(startX, y, items, gap = 32) {
        const ctx = this.ctx;
        let x = startX;
        return items.map(item => {
            ctx.font = item.font;
            const w = ctx.measureText(item.text).width;
            const pos = { ...item, x, y, w };
            x += w + gap;
            return pos;
        });
    }

    drawWaitList(waitTiles, centerX, startY, labelText) {
        // 原 _drawWaitList 內容
    }

    drawResultHand(result, centerX, startY, isChombo = false) {
        // 原 _drawResultHand 內容
    }

    drawStaticHand(player, centerX, startY, faceDown = false) {
        // 原 _drawStaticHand 內容
    }
}
