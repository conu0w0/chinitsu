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
    
    // 1. 支援舊版傳 boolean (isChombo) 或是新版傳 object
    const isChombo = (typeof options === 'boolean') ? options : (options.isChombo || false);
    const isStatic = options.isStatic || false; // 未來擴充用：例如手牌還在飛，不畫靜態底

    // 2. 座標安全檢查 (使用 Renderer 的 config)
    const safeStartY = (Number.isFinite(startY)) ? startY : r.config.height * 0.7;
    
    // 3. 命名一致性修正
    const tileCfg = r.config.tile;
    const tileW = tileCfg.w;
    const tileH = tileCfg.h;
    const gap = tileCfg.gap || 2;
    const sectionGap = 30; 

    // 4. 取得正確的玩家資料
    const idx = isChombo ? result.offenderIndex : result.winnerIndex;
    const player = r.gameState.players[idx];
    if (!player) return null;

    // 5. 計算手牌與和了牌邏輯
    let standingTiles = [...player.tepai];
    let winTile = -1;
    
    // 如果是和牌且手牌是滿的，最後一張通常是和了牌
    if (standingTiles.length % 3 === 2) {
        winTile = standingTiles.pop();
    } else if (r.gameState.lastDiscard) {
        winTile = r.gameState.lastDiscard.tile;
    }

    // 6. 寬度與起始位置計算 (為了置中)
    const melds = player.fulu || [];
    let totalWidth = standingTiles.length * (tileW + gap);
    
    if (melds.length > 0) {
        totalWidth += sectionGap;
        // 注意：這裡呼叫的是主 Renderer 的私有方法，建議維持 this.r._...
        melds.forEach(m => totalWidth += r._calculateMeldWidth(m, tileW) + 10);
    }
    totalWidth += sectionGap + tileW;

    let currentX = centerX - (totalWidth / 2);
    const handLeftX = currentX;

    // 7. 開始繪製手牌
    standingTiles.forEach(t => {
        r.drawTile(t, currentX, safeStartY, tileW, tileH);
        currentX += tileW + gap;
    });

    // 繪製副露 (吃碰槓)
    if (melds.length > 0) {
        currentX += sectionGap;
        melds.forEach(m => {
            const w = this.r._drawSingleMeld(m, currentX, safeStartY, tileW, tileH);
            currentX += w + 10;
        });
    }

    // 8. 繪製和了牌 (加框與標籤)
    currentX += sectionGap;
    const highlightColor = isChombo ? "#ff4444" : "#ffcc00";

    r.drawTile(winTile, currentX, safeStartY, tileW, tileH);

    ctx.lineWidth = 4;
    ctx.strokeStyle = highlightColor;
    ctx.strokeRect(currentX, safeStartY, tileW, tileH);

    ctx.fillStyle = highlightColor;
    // 修正：使用正確的 fontFamily 路徑
    ctx.font = `bold 20px ${r.config.fontFamily}`; 
    ctx.textAlign = "center";
    ctx.fillText(isChombo ? "錯和" : "和了", currentX + tileW / 2, safeStartY + tileH + 30);

    return handLeftX; // 回傳左邊座標給 ResultRenderer 算分數位置汪！
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
