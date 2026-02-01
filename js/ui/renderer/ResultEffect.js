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
    /**
     * 蓋章動畫文字 - 改良為 Z 軸垂直掉落感
     */
    stampText({ text, x, y, font, color = "#fff", startTime, duration = 500 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const rawT = Math.min(1, (now - startTime) / duration);
        
        // 使用自定義的強烈 easeOutBack
        const p = rawT - 1;
        const s = 1.2; // 回彈係數，越大落地瞬間晃動感越強
        const t = p * p * ((s + 1) * p + s) + 1;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        
        // 測量文字寬度以計算中心點
        const metrics = ctx.measureText(text);
        const centerX = x + metrics.width / 2;
        const centerY = y - 20; // 粗略估計文字中心高度 (y 是基準線)

        // 計算縮放：從 3.0 倍掉落到 1.0 倍
        // 讓縮放跟隨 t 動畫，達成落地回彈感
        const scale = 3.0 - 2.0 * t; 
        
        // 透明度：快速淡入
        ctx.globalAlpha = Math.min(1, rawT * 2);

        // --- 核心改動：中心縮放 ---
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        
        // 設定套色
        ctx.fillStyle = color;
        if (color !== "#fff") {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15 * t; // 落地後發光變強
        }

        // 繪製文字 (位移回左上角)
        ctx.fillText(text, -metrics.width / 2, 20); 

        ctx.restore();
    }

    /**
     * 斜向高光動畫（用在役滿及累計役滿）
     */
    diagonalHighlight({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        if (!Number.isFinite(startTime)) return;

        const ctx = this.ctx;
        const now = performance.now();

        ctx.save();
        try {
            // --- 1：先設定文字狀態，方便計算範圍 ---
            ctx.font = font;
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            const metrics = ctx.measureText(text);
            const fontSize = parseInt(font) || 48;
            const w = metrics.width;
            const h = fontSize * 1.5;
            const textCenterY = y - fontSize * 0.35;

            // --- 2：設定混合模式 ---
            // source-atop 會把接下來畫的東西，限制在「畫布已有像素」的範圍內
            ctx.globalCompositeOperation = "source-atop";

            const DURATION = isSilver ? 2200 : 1600;
            const t = ((now - startTime) % DURATION) / DURATION;

            // 計算掃描位移
            const diag = Math.sqrt(w * w + h * h);
            const offset = (t * 2 - 1) * (diag + 100); 
            const rad = angle * Math.PI / 180;
            const dx = Math.cos(rad);
            const dy = Math.sin(rad);

            const gradX = x + w / 2 + dx * offset;
            const gradY = textCenterY + dy * offset;
            const bandWidth = 60; // 稍微寬一點效果更好
            
            const grad = ctx.createLinearGradient(
                gradX - dx * bandWidth, gradY - dy * bandWidth,
                gradX + dx * bandWidth, gradY + dy * bandWidth
            );

            // 漸層色設定
            if (isSilver) {
                grad.addColorStop(0, "rgba(255, 255, 255, 0)");
                grad.addColorStop(0.5, "rgba(255, 255, 255, 0.8)"); 
                grad.addColorStop(1, "rgba(255, 255, 255, 0)");
            } else {
                grad.addColorStop(0, "rgba(255, 215, 0, 0)");
                grad.addColorStop(0.5, "rgba(255, 255, 220, 0.9)"); 
                grad.addColorStop(1, "rgba(255, 215, 0, 0)");
            }

            // --- 3：直接畫上覆蓋全文字的矩形 ---
            ctx.fillStyle = grad;
            // 這裡畫的是矩形，但因為 source-atop，它只會顯示在文字形狀上
            ctx.fillRect(x - 10, y - fontSize - 10, w + 20, fontSize + 20);

        } finally {
            ctx.restore(); // 務必還原混合模式，否則後面畫的東西全都會消失
        }
    }
}
