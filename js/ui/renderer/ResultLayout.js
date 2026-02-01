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
        const ctx = this.ctx;
        const tileW = 36;
        const tileH = 50;
        const gap = 10;
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
        ctx.fillStyle = "#dddddd";
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

    drawResultHand(result, centerX, startY, isChombo = false) {
    // 1. 安全檢查：如果 startY 無效，預設放在畫布 40% 的高度
    const safeStartY = (startY && startY > 0 && startY < this.r.config.height) 
                       ? startY 
                       : this.r.config.height * 0.4;     
    
    // 2. 修正屬性路徑 (統一使用新的 config 結構)
    const tileCfg = this.r.config.tile;
    const tileW = tileCfg.w;
    const tileH = tileCfg.h;
    const gap = tileCfg.gap || 2;
    const sectionGap = 30; // 稍微拉開距離更有質感
    
    // 3. 獲取獲勝者資訊
    const idx = (result.type === "chombo") ? result.offenderIndex : result.winnerIndex;
    const winner = this.r.gameState.players[idx];
    if (!winner) return null;

    // 4. 計算手牌與 winTile (這段維持你的邏輯)
    const ankanCount = (winner.fulu ?? []).filter(f => f.type === "ankan").length;
    const baseLen = 13 - ankanCount * 3;
    const isHandFull = (winner.tepai.length === baseLen + 1);

    let standingTiles = [...winner.tepai];
    let winTile = -1;

    if (isHandFull) {
        winTile = standingTiles.pop();
    } else {
        winTile = (this.r.gameState.lastDiscard) ? this.r.gameState.lastDiscard.tile : standingTiles.pop();
    }

    if (winTile == null) return null;

    // 5. 計算佈局總寬度 (確保居中)
    const melds = winner.fulu || [];
    let totalWidth = standingTiles.length * (tileW + gap);
    if (melds.length > 0) {
        totalWidth += sectionGap;
        melds.forEach(m => totalWidth += this.r._calculateMeldWidth(m, tileW) + 10);
    }
    totalWidth += sectionGap + tileW; // 加上最後一張和了牌

    let currentX = centerX - (totalWidth / 2);
    const handLeftX = currentX;

    // 6. 開始繪製 (注意：這裡全部改用 safeStartY)
    standingTiles.forEach(t => {
        this.r.drawTile(t, currentX, safeStartY, tileW, tileH);
        currentX += tileW + gap;
    });

    if (melds.length > 0) {
        currentX += sectionGap;
        melds.forEach(m => {
            const w = this.r._drawSingleMeld(m, currentX, safeStartY, tileW, tileH);
            currentX += w + 10;
        });
    }

    // 7. 繪製和了牌與標記
    currentX += sectionGap;
    const highlightColor = isChombo ? "#ff4444" : "#ffcc00";

    // 使用 safeStartY 繪製最後一張牌
    this.r.drawTile(winTile, currentX, safeStartY, tileW, tileH, {
        highlight: true // 如果你的 drawTile 有支援
    });

    // 畫出醒目的外框
    this.ctx.lineWidth = 4;
    this.ctx.strokeStyle = highlightColor;
    this.ctx.strokeRect(currentX, safeStartY, tileW, tileH);

    // 畫文字標籤
    this.ctx.fillStyle = highlightColor;
    this.ctx.font = `bold 22px ${this.r.config.fontFamily}`; // 注意這裡的路徑
    this.ctx.textAlign = "center";

    let label = isChombo ? "錯和" : "和了";
    this.ctx.fillText(label, currentX + tileW / 2, safeStartY + tileH + 35);

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
