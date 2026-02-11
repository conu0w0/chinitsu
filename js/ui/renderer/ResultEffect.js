export class ResultEffect {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
    }

    /**
     * 漸顯文字
     */
    fadeInText({ text, x, y, font, color = "#fff", startTime, textAlign = "center", duration = 400, strokeWidth = 4 }) {
        const ctx = this.ctx;
        const t = Math.min(1, (performance.now() - startTime) / duration);

        ctx.save();
        ctx.font = font;
        ctx.globalAlpha = t;
        ctx.textAlign = textAlign || "center";
        ctx.textBaseline = "alphabetic";

        if (strokeWidth > 0) {
            ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
            ctx.lineWidth = strokeWidth;
            ctx.lineJoin = "round";
            ctx.strokeText(text, x, y);
        }

        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    /**
     * 蓋章動畫文字 - 加入描邊效果
     */
    stampText({ text, x, y, font, color = "#fff", startTime, textAlign = "center", duration = 450 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const rawT = Math.min(1, (now - startTime) / duration);

        // backOut
        const p = rawT - 1;
        const s = 1.7;
        const t = p * p * ((s + 1) * p + s) + 1;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = textAlign;
        ctx.textBaseline = "alphabetic";

        // ✅ 計算文字中心（以目前 align 推回中心）
        const metrics = ctx.measureText(text);
        const w = metrics.width;
        const fontSize = parseInt(font.match(/(\d+)px/)?.[1]) || 48;

        let leftX = x;
        if (textAlign === "center") leftX = x - w / 2;
        else if (textAlign === "right") leftX = x - w;

        const centerX = leftX + w / 2;
        const centerY = y - fontSize * 0.35; // alphabetic baseline 往上抓一點

        const scale = 1.4 - 0.4 * t;
        ctx.globalAlpha = Math.max(0, (rawT - 0.25) / 0.75);

        // ✅ 以中心為縮放軸
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-centerX, -centerY);

        // 描邊 + 填色（描邊寬度可依字大小調）
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.lineWidth = 8;
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);

        ctx.fillStyle = color;
        ctx.fillText(text, x, y);

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
