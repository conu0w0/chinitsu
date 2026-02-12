export class ResultEffect {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
    }

    /**
     * 統一黑色描邊文字 - 已移除爆閃白光
     */
    drawOutlinedText({
        text, x, y, font,
        fill = "#fff",
        align = "center",
        alpha = 1,
        strokeWidth = 6,
        style = "black", 
        glow = 0
    }) {
        const ctx = this.ctx;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = align;
        ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.globalAlpha = alpha;

        if (strokeWidth > 0) {
            // 🌟 處理蓋章衝擊感 (glow)：改為加強黑色陰影，而不是畫白線
            if (glow > 0) {
                ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
                ctx.shadowBlur = strokeWidth * glow * 1.5; // 落地時產生黑色震動陰影
                ctx.shadowOffsetX = 2 * glow;
                ctx.shadowOffsetY = 4 * glow;
            }

            // 1. 最外層紮實黑框
            ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
            ctx.lineWidth = strokeWidth;
            ctx.strokeText(text, x, y);

            // 2. 內層半透明疊加（增加厚度感）
            ctx.shadowBlur = 0; // 畫內層時關閉陰影，避免糊掉
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            const inner = Math.max(1, Math.round(strokeWidth * 0.45));
            ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
            ctx.lineWidth = inner;
            ctx.strokeText(text, x, y);
        }

        // 最後填充文字本體
        ctx.fillStyle = fill;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    /**
     * 漸顯文字 (維持不變)
     */
    fadeInText({ text, x, y, font, color = "#fff", startTime, textAlign = "center", duration = 400, strokeWidth = 4, strokeStyle = "black" }) {
        const raw = (performance.now() - startTime) / duration;
        const t = Math.max(0, Math.min(1, raw));
        if (t <= 0) return;

        this.drawOutlinedText({
            text, x, y, font,
            fill: color,
            align: textAlign || "center",
            alpha: t,
            strokeWidth,
            style: strokeStyle,
            glow: 0.0
        });
    }

    /**
     * 蓋章動畫文字 (修正過時的預設值)
     */
    stampText({
        text, x, y, font, color = "#fff",
        startTime, textAlign = "center", duration = 420,
        drop = 28,        
        popScale = 1.55,  
        strokeWidth = 8,
        strokeStyle = "black"
    }) {
        const ctx = this.ctx;
        const now = performance.now();

        const raw = (now - startTime) / duration;
        const u = Math.max(0, Math.min(1, raw));
        if (u <= 0) return;

        const fall = 1 - Math.pow(1 - u, 3); 
        const p = u - 1;
        const s = 1.9;
        const bounce = p * p * ((s + 1) * p + s) + 1; 

        ctx.save();
        ctx.font = font;
        ctx.textAlign = textAlign;
        ctx.textBaseline = "alphabetic";

        const metrics = ctx.measureText(text);
        const w = metrics.width;
        const fontSize = parseInt(font.match(/(\d+)px/)?.[1]) || 48;

        let leftX = x;
        if (textAlign === "center") leftX = x - w / 2;
        else if (textAlign === "right") leftX = x - w;

        const centerX = leftX + w / 2;
        const centerY = y - fontSize * 0.35;

        const scale = 1 + (popScale - 1) * (1 - fall);
        const impactScale = 1 + 0.08 * (bounce - 1); 
        const finalScale = scale * impactScale;
        const yOffset = -drop * (1 - fall); 
        const alpha = Math.min(1, u * 3); 

        // 落地瞬間的衝擊值 (0.78s 左右最強)
        const impact = Math.max(0, 1 - Math.abs(u - 0.78) / 0.08);

        ctx.translate(centerX, centerY);
        ctx.scale(finalScale, finalScale);
        ctx.translate(-centerX, -centerY);

        this.drawOutlinedText({
            text, x, y: y + yOffset, font,
            fill: color, align: textAlign,
            alpha, strokeWidth, style: strokeStyle,
            glow: impact
        });

        ctx.restore();
    }

    /**
     * 斜向高光動畫 - 確保只套用在文字筆劃
     */
    diagonalHighlight({ text, x, y, font, startTime, textAlign = "left", angle = 45, isSilver = false }) {
        if (!Number.isFinite(startTime)) return;

        const ctx = this.ctx;
        const now = performance.now();

        ctx.save();
        ctx.font = font;
        ctx.textAlign = textAlign;
        ctx.textBaseline = "alphabetic";

        const metrics = ctx.measureText(text);
        const fontSize = parseInt(font.match(/(\d+)px/)?.[1]) || 48;
        const w = metrics.width;
        
        // 1. 先畫最底層的強力黑邊 (防止高光溢出並增加立體感)
        ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
        ctx.lineWidth = 10; // 比靜態的再粗一點點
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);

        // 2. 畫文字底色
        ctx.fillStyle = isSilver ? "#e0e0e0" : "#ffcc00"; 
        ctx.fillText(text, x, y);

        // 3. 準備高光漸層計算
        const DURATION = isSilver ? 2200 : 1600;
        const t = ((now - startTime) % DURATION) / DURATION;
        const diag = Math.sqrt(w * w + fontSize * fontSize);
        const offset = (t * 2 - 1) * (diag + 100); 
        const rad = angle * Math.PI / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);

        let startX = x;
        if (textAlign === "center") startX = x - w / 2;
        else if (textAlign === "right") startX = x - w;

        const gradX = startX + w / 2 + dx * offset;
        const gradY = (y - fontSize / 2) + dy * offset;
        
        const grad = ctx.createLinearGradient(
            gradX - dx * 60, gradY - dy * 60,
            gradX + dx * 60, gradY + dy * 60
        );

        if (isSilver) {
            grad.addColorStop(0, "rgba(255, 255, 255, 0)");
            grad.addColorStop(0.5, "rgba(255, 255, 255, 0.9)"); // 銀白色強光
            grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        } else {
            grad.addColorStop(0, "rgba(255, 215, 0, 0)");
            grad.addColorStop(0.5, "rgba(255, 255, 230, 1)"); // 金黃色亮點
            grad.addColorStop(1, "rgba(255, 215, 0, 0)");
        }

        // 4. 關鍵：在 source-atop 模式下只渲染文字內部的高光
        ctx.save();
        ctx.globalCompositeOperation = "source-atop"; 
        ctx.fillStyle = grad;
        ctx.fillText(text, x, y); 
        ctx.restore(); 

        // 5. 最後再補一層細邊邊，確保邊界銳利汪！
        ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
        ctx.lineWidth = 2;
        ctx.strokeText(text, x, y);
        
        ctx.restore(); // 結束後一定要 restore，否則之後畫的東西都會變 source-atop
    }
}
    