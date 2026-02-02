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
     * 蓋章動畫文字 - 改良為近距離重擊感
     */
    stampText({ text, x, y, font, color = "#fff", startTime, duration = 450 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const rawT = Math.min(1, (now - startTime) / duration);
        
        // 強勁的回彈效果
        const p = rawT - 1;
        const s = 1.7; 
        const t = p * p * ((s + 1) * p + s) + 1;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        
        const metrics = ctx.measureText(text);
        const centerX = x + metrics.width / 2;
        const centerY = y - 20; 

        // 調整 1：近距離縮放 (從 1.4 倍掉落到 1.0 倍)
        const scale = 1.4 - 0.4 * t; 
        
        // 調整 2：延遲出現 (動畫過 40% 才顯示，增加重擊感)
        ctx.globalAlpha = Math.max(0, (rawT - 0.4) / 0.6);

        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        
        // 位移回中心點繪製
        ctx.fillText(text, -metrics.width / 2, 20); 
        ctx.restore();
    }

    /**
     * 斜向高光動畫 - 確保只套用在文字筆劃
     */
    diagonalHighlight({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        if (!Number.isFinite(startTime)) return;

        const ctx = this.ctx;
        const now = performance.now();

        ctx.save();
        
        // 1. 設定文字基本屬性
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        const metrics = ctx.measureText(text);
        const fontSize = parseInt(font) || 48;
        const w = metrics.width;
        
        const DURATION = isSilver ? 2200 : 1600;
        const t = ((now - startTime) % DURATION) / DURATION;

        // 計算掃描位置
        const diag = Math.sqrt(w * w + fontSize * fontSize);
        const offset = (t * 2 - 1) * (diag + 100); 
        const rad = angle * Math.PI / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);

        const gradX = x + w / 2 + dx * offset;
        const gradY = (y - fontSize / 2) + dy * offset;
        
        const grad = ctx.createLinearGradient(
            gradX - dx * 25, gradY - dy * 25,
            gradX + dx * 25, gradY + dy * 25
        );

        if (isSilver) {
            grad.addColorStop(0, "rgba(255, 255, 255, 0)");
            grad.addColorStop(0.5, "rgba(255, 255, 255, 0.65)"); 
            grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        } else {
            grad.addColorStop(0, "rgba(255, 215, 0, 0)");
            grad.addColorStop(0.5, "rgba(255, 255, 230, 0.75)"); 
            grad.addColorStop(1, "rgba(255, 215, 0, 0)");
        }

        // 2. 核心遮罩：使用 source-atop
        // 必須確保畫布上該位置已經先畫好了底色文字
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = grad;
        ctx.shadowBlur = 0; 
        
        // 3. 填入漸層矩形 (只會顯示在文字筆劃內)
        ctx.fillRect(x - 20, y - fontSize - 20, w + 40, fontSize + 40);

        ctx.restore();
    }
}
