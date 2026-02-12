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

    /**
     * 繪製聽牌列表
     * @param {Array} waitTiles - 聽牌清單
     * @param {number} centerX - 中心 X
     * @param {number} startY - 起始 Y
     * @param {boolean} isFuriten - 是否振聽
     * @param {boolean} showFuriten - 是否要顯示振聽狀態 (流局時可傳 false)
     */
    drawWaitList(waitTiles, centerX, startY, isFuriten = false, showFuriten = true) {
        const ctx = this.ctx;
        const tileW = 36;
        const tileH = 50;
        const gap = 10;
        
        let labelText = "聽牌";
        let labelColor = "#2fe5eb"; 

        if (!waitTiles || waitTiles.length === 0) {
            labelText = "未聽牌";
            labelColor = "#aaaaaa";
        } else if (isFuriten && showFuriten) { // ★ 只有在需要顯示振聽時才變紅
            labelText = "振聽";   
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

    /**
     * 繪製結算手牌 (支援詐立直邏輯)
     */
    drawResultHand(result, centerX, startY, options = {}) {
        const { r, ctx } = this;
        // 判定是否為錯和
        const isChombo = (typeof options === 'boolean') ? options : (options.isChombo || false);
        // 如果是詐立直，不需要顯示右側的「和了/錯和牌」
        const isFalseRiichi = result.reason === "詐立直";
        const alignToInGameHand = (typeof options === "object") ? (options.alignToInGameHand ?? true) : true;

        const tileCfg = r.config.tile;
        const tileW = tileCfg.w;
        const tileH = tileCfg.h;
        const gap = tileCfg.gap || 2;
        const sectionGap = tileCfg.drawGap; 
        
        const idx = isChombo ? result.offenderIndex : result.winnerIndex;
        const player = r.gameState.players[idx];
        if (!player) return null;
        
        const getPureId = (t) => (t && typeof t === 'object') ? t.tile : t;
        let standingTiles = player.tepai.map(getPureId); 
        let winTile = -1;
        
        // --- 判斷是否需要繪製 winTile ---
        if (!isFalseRiichi) {
            if (standingTiles.length % 3 === 2) {
                winTile = standingTiles.pop(); // 自摸的情況
            } else if (r.gameState.lastDiscard) {
                winTile = getPureId(r.gameState.lastDiscard.tile); // 榮和的情況
            }
        }
        
        const melds = player.fulu || [];

        if (alignToInGameHand) {
            const isComWinner = (idx === 1);
            const physics = isComWinner ? r.handPhysics.com : r.handPhysics.player;

            // 對局原本的手牌長度（含摸牌槽位）
            const inGameTotal = player.tepai.length;

            // 只允許暗槓：先算槓子數（一定要在使用前宣告）
            const kanCount = (melds || []).filter(f => f.type === "ankan").length;

            // ✅ 規則：
            // - COM 和牌且沒有暗槓：對齊「玩家手牌左側」
            // - 有暗槓：改採用置中（下面 offsetX 會處理）
            const forceAlignToPlayerLeft = isComWinner && kanCount === 0;

            // ✅ 強制對齊玩家左側時，用 playerHand 的 zone 來算格線
            const zoneKey = forceAlignToPlayerLeft
                ? "playerHand"
                : (isComWinner ? "comHand" : "playerHand");

            const zone = r.ZONES[zoneKey];

            // 對齊玩家左側 => 左→右；否則用各自方向
            const dirX = forceAlignToPlayerLeft
                ? 1
                : (zone.direction?.x ?? (isComWinner ? -1 : 1));

            // 取得每一格 X：強制對齊玩家左側時，不使用 physics（避免拿到 comHand 的 lerp 座標）
            const inGameXs = Array.from({ length: inGameTotal }, (_, i) => {
                if (!forceAlignToPlayerLeft) {
                const v = physics?.currentXs?.[i];
                if (v !== undefined && !isNaN(v)) return v;
                }
                return r._calculateTileX(i, inGameTotal, zone, tileCfg, dirX);
            });

            const standCount = standingTiles.length;
            let standXs = inGameXs.slice(0, standCount);

            // 強制對齊玩家左側時不要 reverse，不然又會反著排
            if (isComWinner && !forceAlignToPlayerLeft) {
                standXs = standXs.slice().reverse();
            }

            const sectionGapLocal = sectionGap;
            const meldGap = 10;

            // === 有暗槓：整串置中（手牌+副露+和了牌）===
            let groupLeft = Math.min(...standXs);
            let groupRight = Math.max(...standXs) + tileW;

            // 用最後一張當右端基準（比 Math.max 更穩）
            let probeX = standXs[standXs.length - 1] + tileW;

            if (melds.length > 0) {
                probeX += sectionGapLocal;
                melds.forEach(m => {
                const mw = r._calculateMeldWidth(m, tileW);
                probeX += mw + meldGap;
                });
            }

            if (!isFalseRiichi && winTile !== -1) {
                probeX += sectionGapLocal + tileW;
            }

            groupRight = Math.max(groupRight, probeX);

            const groupCenter = (groupLeft + groupRight) / 2;

            // 有暗槓才置中
            const offsetX = (kanCount > 0) ? r._snap(centerX - groupCenter) : 0;

            // --- 手牌 ---
            standingTiles.forEach((t, i) => {
                r.drawTile(t, standXs[i] + offsetX, startY, tileW, tileH);
            });

            // 回傳立牌最左 X（score anchor 用）
            const handLeftX = groupLeft + offsetX;

            // --- 副露 ---
            let currentX = (standXs[standXs.length - 1] + tileW) + offsetX;

            if (melds.length > 0) {
                currentX += sectionGapLocal;
                melds.forEach(m => {
                const w = r._drawSingleMeld(m, currentX, startY, tileW, tileH);
                currentX += w + meldGap;
                });
            }

            // --- 和了牌 ---
            if (!isFalseRiichi && winTile !== -1) {
                currentX += sectionGapLocal;
                const finalWinX = currentX;
                const highlightColor = isChombo ? "#ff4444" : "#ffcc00";

                r.drawTile(getPureId(winTile), finalWinX, startY, tileW, tileH);

                ctx.save();
                ctx.lineWidth = 4;
                ctx.strokeStyle = highlightColor;
                ctx.strokeRect(finalWinX, startY, tileW, tileH);

                ctx.fillStyle = highlightColor;
                ctx.font = `bold 20px ${r.config.fontFamily}`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillText(isChombo ? "錯和" : "和了", finalWinX + tileW / 2, startY + tileH + 10);
                ctx.restore();
            }

            return handLeftX;
        }
        
        // 計算總寬度 (如果是詐立直，不計入右側那一張的寬度)
        let totalWidth = standingTiles.length * (tileW + gap);
        if (melds.length > 0) {
            totalWidth += sectionGap;
            melds.forEach(m => totalWidth += r._calculateMeldWidth(m, tileW) + 10);
        }
        
        if (!isFalseRiichi && winTile !== -1) {
            totalWidth += sectionGap + tileW; 
        }
        
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
        
        // 3. 繪製最後一張牌 (詐立直時跳過此步驟)
        if (!isFalseRiichi && winTile !== -1) {
            currentX += sectionGap;
            const finalWinX = currentX; 
            const highlightColor = isChombo ? "#ff4444" : "#ffcc00";
            
            r.drawTile(getPureId(winTile), finalWinX, startY, tileW, tileH);
            
            ctx.save();
            ctx.lineWidth = 4;
            ctx.strokeStyle = highlightColor;
            ctx.strokeRect(finalWinX, startY, tileW, tileH);
            
            ctx.fillStyle = highlightColor;
            ctx.font = `bold 20px ${r.config.fontFamily}`; 
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(isChombo ? "錯和" : "和了", finalWinX + tileW / 2, startY + tileH + 10);
            ctx.restore();
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

    /**
     * 固定寬度平均分配 (支援切齊手牌左側)
     * @param {number} anchorX - 基準 X (可能是中心點或手牌左側)
     * @param {number} y - Y 座標
     * @param {Array} items - 排版項目
     * @param {number} totalWidth - 總分配寬度
     * @param {boolean} alignToLeft - 是否將起始位置切齊 anchorX
     */
    layoutScoreRowFixed(anchorX, y, items, totalWidth = 800, alignToLeft = false) {
        const count = items.length;
        if (count === 0) return [];

        // 算出每一格的寬度
        const cellWidth = totalWidth / Math.max(1, count);

        return items.map((item, index) => {
            let x, textAlign;

            if (alignToLeft && index === 0) {
                x = anchorX;
                textAlign = "left";
            } else {
                // 起始點偏移 + (目前索引 * 格子寬) + (半個格子寬度來置中)
                const startOffset = alignToLeft ? anchorX : (anchorX - totalWidth / 2);
                x = startOffset + (index * cellWidth) + (cellWidth / 2);
                textAlign = "center";
            }

            return {
                ...item,
                x,
                y,
                textAlign
            };
        });
    }
}
