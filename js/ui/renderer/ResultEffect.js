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

    export class ResultEffect {
    // ... constructor 略

    /**
     * 蓋章動畫文字 - 改良為近距離重擊感
     */
    stampText({ text, x, y, font, color = "#fff", startTime, duration = 450 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const rawT = Math.min(1, (now - startTime) / duration);
        
        // 更強勁的回彈效果
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

        // --- 調整 1：近距離縮放 ---
        // 從 1.4 倍縮小到 1.0 倍，感覺是從很近的地方壓下來
        const scale = 1.4 - 0.4 * t; 
        
        // --- 調整 2：延遲出現 ---
        // 動畫進行到一半 (0.5) 才開始快速淡入，製造「突然出現」的衝擊感
        ctx.globalAlpha = Math.max(0, (rawT - 0.4) / 0.6);

        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        
        ctx.fillStyle = color;
        if (color !== "#fff" && color !== "#ffffff") {
            ctx.shadowColor = color;
            ctx.shadowBlur = 15 * t;
        }

        ctx.fillText(text, -metrics.width / 2, 20); 
        ctx.restore();
    }

    /**
     * 斜向高光動畫
     */
    diagonalHighlight({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        if (!Number.isFinite(startTime)) return;

        const ctx = this.ctx;
        const now = performance.now();

        ctx.save();
        
        // 1. 設定文字基本狀態
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";

        const metrics = ctx.measureText(text);
        const fontSize = parseInt(font) || 48;
        const w = metrics.width;
        
        const DURATION = isSilver ? 2200 : 1600;
        const t = ((now - startTime) % DURATION) / DURATION;

        const diag = Math.sqrt(w * w + fontSize * fontSize);
        const offset = (t * 2 - 1) * (diag + 100); 
        const rad = angle * Math.PI / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);

        const gradX = x + w / 2 + dx * offset;
        const gradY = (y - fontSize/2) + dy * offset;
        
        const grad = ctx.createLinearGradient(
            gradX - dx * 40, gradY - dy * 40,
            gradX + dx * 40, gradY + dy * 40
        );

        if (isSilver) {
            grad.addColorStop(0, "rgba(255, 255, 255, 0)");
            grad.addColorStop(0.5, "rgba(255, 255, 255, 0.85)"); 
            grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        } else {
            grad.addColorStop(0, "rgba(255, 215, 0, 0)");
            grad.addColorStop(0.5, "rgba(255, 255, 230, 0.95)"); 
            grad.addColorStop(1, "rgba(255, 215, 0, 0)");
        }

        // --- 修正邏輯：先切換模式，再「填色」入文字筆劃 ---
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = grad;
        ctx.shadowBlur = 0; // 高光本身不帶陰影
        
        // 直接塗抹在文字區域
        ctx.fillRect(x - 20, y - fontSize - 20, w + 40, fontSize + 40);

        ctx.restore();
    }
}
