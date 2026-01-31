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

        ctx.font = `bold 22px ${this.r.fontFamily}`;
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
        const idx = (result.type === "chombo") ? result.offenderIndex : result.winnerIndex;
        const winner = this.r.gameState.players[idx];
        if (!winner) return null;

        const ankanCount = (winner.fulu ?? []).filter(f => f.type === "ankan").length;
        const baseLen = 13 - ankanCount * 3;
        const isHandFull = (winner.tepai.length === baseLen + 1);

        let standingTiles = [...winner.tepai];
        let winTile = -1;

        if (isHandFull) {
            winTile = standingTiles.pop();
        } else {
            if (!isHandFull && this.r.gameState.lastDiscard) {
                winTile = this.r.gameState.lastDiscard.tile;
            } else {
                winTile = standingTiles.pop();
            }
        }

        if (winTile == null) {
            console.warn("[ResultRenderer] winTile missing", { result, standingTiles });
            return null;
        }

        const melds = winner.fulu || [];
        const tileW = this.r.tileWidth;
        const tileH = this.r.tileHeight;
        const gap = 2;
        const sectionGap = 25;

        let totalWidth = standingTiles.length * (tileW + gap);
        if (melds.length > 0) {
            totalWidth += sectionGap;
            melds.forEach(m => totalWidth += this.r._calculateMeldWidth(m, tileW) + 10);
        }
        totalWidth += sectionGap + tileW;

        let currentX = centerX - (totalWidth / 2);
        const handLeftX = currentX;

        standingTiles.forEach(t => {
            this.r.drawTile(t, currentX, startY, tileW, tileH);
            currentX += tileW + gap;
        });

        if (melds.length > 0) {
            currentX += sectionGap;
            melds.forEach(m => {
                const w = this.r._drawSingleMeld(m, currentX, startY, tileW, tileH);
                currentX += w + 10;
            });
        }

        currentX += sectionGap;
        const highlightColor = isChombo ? "#ff4444" : "#ffcc00";

        this.r.drawTile(winTile, currentX, startY, tileW, tileH);

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = highlightColor;
        this.ctx.strokeRect(currentX, startY, tileW, tileH);

        this.ctx.fillStyle = highlightColor;
        this.ctx.font = `bold 18px ${this.r.fontFamily}`;
        this.ctx.textAlign = "center";

        let label = isChombo ? "錯和" : "和了";
        this.ctx.fillText(label, currentX + tileW / 2, startY + tileH + 25);

        return handLeftX;
    }

    drawStaticHand(player, centerX, startY, faceDown = false) {
        const tiles = player.tepai;
        const melds = player.fulu || [];
        const tileW = this.r.tileWidth;
        const tileH = this.r.tileHeight;
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
