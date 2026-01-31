export class ResultEffect {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
    }

    /**
     * 漸顯文字
     */
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

    /**
     * 蓋章動畫文字
     */
    stampText({ text, x, y, font, startTime, duration = 500, dropHeight = 40 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const rawT = Math.min(1, (now - startTime) / duration);
        const p = rawT - 1;

        // easeOutBack（像蓋章的動畫）
        const s = 1.70158;
        const t = p * p * ((s + 1) * p + s) + 1;

        const ty = y - dropHeight * (1 - t);
        const scale = 1.15 - 0.15 * t;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = t;

        ctx.translate(x, ty);
        ctx.scale(scale, scale);
        ctx.fillText(text, 0, 0);

        ctx.restore();
    }

    /**
     * 斜向高光動畫（通常用在役滿或累計役滿）
     */
    diagonalHighlight({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        if (!Number.isFinite(startTime)) return;

        const ctx = this.ctx;
        const now = performance.now();

        ctx.save();
        try {
            ctx.font = font;
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            const metrics = ctx.measureText(text);
            const fontSizeMatch = font.match(/(\d+)px/);
            const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 48;

            const w = metrics.width;
            const h = fontSize * 1.25;

            // 1. 先畫白底文字作 Mask
            ctx.fillStyle = "#fff";
            ctx.fillText(text, x, y);

            // 2. 設定混合模式
            ctx.globalCompositeOperation = "source-atop";

            const DURATION = isSilver ? 2200 : 1600;
            const t = ((now - startTime) % DURATION) / DURATION;

            const bandWidth = Math.max(40, w * 0.35);
            const diag = Math.sqrt(w * w + h * h);
            const sweep = diag * 1.2;

            const rad = angle * Math.PI / 180;
            const dx = Math.cos(rad);
            const dy = Math.sin(rad);

            const cx = x + w / 2;
            const cy = y;

            const ox = cx - dx * sweep + dx * sweep * 2 * t;
            const oy = cy - dy * sweep + dy * sweep * 2 * t;

            const grad = ctx.createLinearGradient(
                ox - dx * bandWidth, oy - dy * bandWidth,
                ox + dx * bandWidth, oy + dy * bandWidth
            );

            if (isSilver) {
                grad.addColorStop(0, "rgba(200,220,255,0)");
                grad.addColorStop(0.45, "rgba(220,235,255,0.4)");
                grad.addColorStop(0.5, "rgba(255,255,255,0.95)");
                grad.addColorStop(0.55, "rgba(220,235,255,0.4)");
                grad.addColorStop(1, "rgba(200,220,255,0)");
            } else {
                grad.addColorStop(0, "rgba(255,200,50,0)");
                grad.addColorStop(0.45, "rgba(255,215,100,0.4)");
                grad.addColorStop(0.5, "rgba(255,255,180,0.95)");
                grad.addColorStop(0.55, "rgba(255,215,100,0.4)");
                grad.addColorStop(1, "rgba(255,200,50,0)");
            }

            ctx.fillStyle = grad;
            ctx.fillRect(x, y - h / 2, w, h);

        } finally {
            ctx.restore(); // 一定要還原，避免污染其他畫面
        }
    }
}
