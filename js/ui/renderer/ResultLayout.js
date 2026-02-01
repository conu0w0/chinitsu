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

    drawWaitList(waitTiles, centerX, startY, isFuriten = false) {
        const ctx = this.ctx;
        const tileW = 36;
        const tileH = 50;
        const gap = 10;
        
        let labelText = "聽牌";
        let labelColor = "#dddddd"; // 預設白灰色

        if (!waitTiles || waitTiles.length === 0) {
            labelText = "未聽牌"; // 當沒有聽牌列表時，顯示未聽牌
            labelColor = "#aaaaaa";
        } else if (isFuriten) {
            labelText = "振聽";   // 振聽時顯示紅色
            labelColor = "#ff6666";
        }
        
        const tilesCount = waitTiles?.length || 0;
        const tilesWidth = tilesCount > 0 ? tilesCount * (tileW + gap) - gap : 0;
        const paddingX = 20;
        const paddingY = 14;
        const labelHeight = 26;
        const boxWidth = Math.max(tilesWidth, 120) + paddingX * 2;
        const boxHeight = labelHeight + tileH + 10 + paddingY * 2;
        const boxX = centerX - boxWidth / 2;
        const boxY = startY - paddingY;

        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        ctx.restore();

        ctx.font = `bold 22px ${this.r.config.fontFamily}`;
        ctx.fillStyle = labelColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(labelText, centerX, boxY + paddingY);

        let startX = centerX - tilesWidth / 2;
        const tileY = boxY + paddingY + labelHeight + 6;

        if (!waitTiles || waitTiles.length === 0) {
            ctx.save();
            ctx.globalAlpha = 0.30;
            this.r.drawTile(-1, centerX - tileW / 2, tileY, tileW, tileH, { faceDown: true });
            ctx.restore();
            return;
        }

        waitTiles.forEach(tile => {
            this.r.drawTile(tile, startX, tileY, tileW, tileH);
            startX += tileW + gap;
        });
    }

    drawResultHand(result, centerX, startY, options = {}) {
        const { r, ctx } = this;
        const isChombo = (typeof options === 'boolean') ? options : (options.isChombo || false);
        
        const tileCfg = r.config.tile;
        const tileW = tileCfg.w;
        const tileH = tileCfg.h;
        const gap = tileCfg.gap || 2;
        const sectionGap = 30; 
        
        const idx = isChombo ? result.offenderIndex : result.winnerIndex;
        const player = r.gameState.players[idx];
        if (!player) return null;
        
        let standingTiles = [...player.tepai];
        let winTile = -1;
        
        // 判斷和了牌
        if (standingTiles.length % 3 === 2) {
            winTile = standingTiles.pop();
        } else if (r.gameState.lastDiscard) {
            winTile = r.gameState.lastDiscard.tile;
        }
        
        // 計算總寬度以置中
        const melds = player.fulu || [];
        let totalWidth = standingTiles.length * (tileW + gap);
        if (melds.length > 0) {
            totalWidth += sectionGap;
            melds.forEach(m => totalWidth += r._calculateMeldWidth(m, tileW) + 10);
        }
        totalWidth += sectionGap + tileW; // 加上最後一張和了牌
        
        let currentX = centerX - (totalWidth / 2);
        const handLeftX = currentX;
        
        // 1. 繪製手牌
        standingTiles.forEach(t => {
            r.drawTile(t, currentX, startY, tileW, tileH);
            currentX += tileW + gap;
        });
        
        // 2. 繪製副露
        if (melds.length > 0) {
            currentX += sectionGap;
            melds.forEach(m => {
                const w = this.r._drawSingleMeld(m, currentX, startY, tileW, tileH);
                currentX += w + 10;
            });
        }
        
        // 3. 繪製和了牌 (確保 currentX 在這裡精確指向最後一張牌)
        currentX += sectionGap;
        const finalWinX = currentX; // 鎖定座標
        const highlightColor = isChombo ? "#ff4444" : "#ffcc00";
        
        r.drawTile(winTile, finalWinX, startY, tileW, tileH);
        
        if (!options.isHideLabel) {
            ctx.lineWidth = 4;
            ctx.strokeStyle = highlightColor;
            ctx.strokeRect(finalWinX, startY, tileW, tileH);
            
            ctx.fillStyle = highlightColor;
            ctx.font = `bold 20px ${r.config.fontFamily}`; 
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(isChombo ? "錯和" : "和了", finalWinX + tileW / 2, startY + tileH + 10);
        }
        
        return handLeftX;
    }
    
    drawStaticHand(player, centerX, startY, faceDown = false) {
        const tiles = player.tepai;
        const melds = player.fulu || [];
        const tileW = this.r.config.tile.w;
        const tileH = this.r.config.tile.h;
        const gap = 2;
        const sectionGap = 20;

        let totalWidth = tiles.length * (tileW + gap);
        if (melds.length > 0) {
            totalWidth += sectionGap;
            melds.forEach(m => totalWidth += this.r._calculateMeldWidth(m, tileW) + 10);
        }

        let currentX = centerX - (totalWidth / 2);

        tiles.forEach(t => {
            this.r.drawTile(t, currentX, startY, tileW, tileH, { faceDown });
            currentX += tileW + gap;
        });

        if (melds.length > 0) {
            currentX += sectionGap;
            melds.forEach(m => {
                const w = this.r._drawSingleMeld(m, currentX, startY, tileW, tileH);
                currentX += w + 10;
            });
        }
    }
}
