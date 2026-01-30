export class ResultRenderer {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
        this.gameState = renderer.gameState;

        // 共用設定
        this.fontFamily = renderer.fontFamily;

        // 結算動畫狀態
        this._lastResultRef = null;
        this.resultTimelineStart = 0;

        // 役種動畫相關
        this.resultYakuAnimated = false;
        this.resultYakuFinished = false;
        this.resultYakuEndTime = null;
        this.resultAfterYakuTime = null;
        this.resultYakuBaseY = 0;

        // 分數動畫相關
        this.resultScoreAnimated = false;
        this.resultScoreFinished = false;
        this.resultScoreStartTime = 0;
        this.scoreHighlightStartTime = null;

        this.RESULT_LAYOUT = {
            yakuLineHeight: 45,
            yakuItemsPerCol: 4,
            yakuColWidth: 250
        };

        this.YAKU_ORDER = [
            // === 役滿 / 地方役 ===
            "天和", "地和", "人和",
            "四暗刻", "四暗刻單騎",
            "綠一色", "大竹林",
            "四槓子", "金門橋",
            "九蓮寶燈", "純正九蓮寶燈",
            "石上三年",

            // === 常規役種 ===
            "立直", "兩立直", "一發", "門前清自摸和",
            "燕返", "槓振", "嶺上開花",
            "海底摸月", "河底撈魚",
            "斷么九", "一盃口", "平和",
            "一氣通貫", "三槓子",
            "對對和", "三暗刻", "七對子",
            "純全帶么九", "二盃口", "清一色"
        ];
    }

    /* =================================================================
       結算入口（唯一對外 API）
       ================================================================= */
    draw(result) {
        if (!result) return;

        const ctx = this.ctx;
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;

        // 1. 繪製半透明背景
        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.fillRect(0, 0, W, H);

        // 2. 基礎文字設定
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 3. 檢查是否為新的一次結算（初始化動畫狀態）
        if (this._lastResultRef !== result) {
            this._lastResultRef = result;
            this._resetAnimationState();
        }

        // 4. 根據類型分流
        if (result.type === "chombo") {
            this.drawChombo(result);
        } else if (result.type === "ryuukyoku") {
            this.drawRyuukyoku(result);
        } else {
            this.drawAgari(result);
        }
    }

    /* =================================================================
       繪製：錯和 (Chombo)
       ================================================================= */
    drawChombo(result) {
        const ctx = this.ctx;
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;
        const CX = W / 2;

        // --- 準備資料 ---
        const offender = result.offender;
        const chomboType = result.chomboType;

        let waits = offender?.waits || [];
        let isTenpai = offender?.isTenpai || false;
        let label = "未聽牌";

        if (chomboType === "wrong_agari") {
            label = isTenpai ? "聽牌（錯和）" : "未聽牌（錯和）";
        } else if (chomboType === "furiten") {
            label = "振聽";
        } else if (chomboType === "fake_riichi") {
            label = "詐立直";
        }

        // 1. 標題
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold 64px ${this.r.fontFamily}`;
        ctx.fillText("本局結束", CX, H * 0.25);

        // 2. 原因
        const reasonText = result.reason || "錯和 / 違規";
        ctx.fillStyle = "#ffaaaa";
        ctx.font = `bold 32px ${this.r.fontFamily}`;
        ctx.fillText(`【 ${reasonText} 】`, CX, H * 0.33);

        // 3. 抓取錯和者資訊
        const culpritIndex = result.offenderIndex;
        const isParent = (culpritIndex === this.r.gameState.parentIndex);
        const roleText = isParent ? "親" : "子";
        const who = (culpritIndex === 0) ? "玩家" : "COM";

        // 4. 顯示身分與罰分 (手動計算寬度以置中雙色文字)
        const textPart = `[${roleText}] ${who} 罰符 `;
        const numPart = `-${result.score.total} 點`;

        ctx.font = `bold 50px ${this.r.fontFamily}`;
        const textWidth = ctx.measureText(textPart).width;
        const numWidth = ctx.measureText(numPart).width;
        const totalWidth = textWidth + numWidth;

        let drawX = CX - (totalWidth / 2);
        const drawY = H * 0.48;

        // 切換為靠左繪製
        ctx.textAlign = "left";

        ctx.fillStyle = "#ffffff";
        ctx.fillText(textPart, drawX, drawY);

        ctx.fillStyle = "#ff4444";
        ctx.fillText(numPart, drawX + textWidth, drawY);

        // 畫完切回置中
        ctx.textAlign = "center";

        // 5. 繪製聽牌列表
        this._drawWaitList(waits, CX, H * 0.64, label);

        // 6. 繪製錯和手牌（紅框）
        const handY = H * 0.72;
        this._drawResultHand(result, CX, handY, true);
    }

    /* =================================================================
       繪製：流局 (Ryuukyoku)
       ================================================================= */
    drawRyuukyoku(result) {
        const ctx = this.ctx;
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;
        const CX = W / 2;

        // --- 1. 上方 COM 區域 ---
        const com = this.r.gameState.players[1];
        const comInfo = result.tenpaiInfo.find(t => t.index === 1);
        const comIsTenpai = comInfo.isTenpai;
        const comWaits = comInfo.waits;

        this._drawStaticHand(com, CX, H * 0.15, !comIsTenpai);
        this._drawWaitList(comWaits, CX, H * 0.28, comIsTenpai ? "COM 聽牌" : "COM 未聽");

        // --- 2. 中間 文字區域 ---
        ctx.fillStyle = "#aaddff";
        ctx.font = `bold 64px ${this.r.fontFamily}`;
        ctx.fillText("荒牌流局", CX, H * 0.50);

        // --- 3. 下方 玩家區域 ---
        const player = this.r.gameState.players[0];
        const playerInfo = result.tenpaiInfo.find(t => t.index === 0);
        const playerIsTenpai = playerInfo.isTenpai;
        const playerWaits = playerInfo.waits;

        this._drawWaitList(playerWaits, CX, H * 0.64, playerIsTenpai ? "玩家 聽牌" : "玩家 未聽");
        this._drawStaticHand(player, CX, H * 0.80, !playerIsTenpai);
    }

    /* =================================================================
       繪製：和牌 (Agari)
       ================================================================= */
    drawAgari(result) {
        if (!this.resultTimelineStart) {
            this.resultTimelineStart = performance.now();
        }

        const ctx = this.ctx;
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;
        const CX = W / 2;

        // 時間軸設定
        const t = performance.now() - this.resultTimelineStart;
        const T = { title: 0, winner: 600 };

        // 版面座標基準
        const HAND_Y = H * 0.68;
        const SCORE_Y = HAND_Y - 60;
        const TITLE_OFFSET_X = 520;
        const YAKU_BASE_Y = H * 0.38;

        this.resultYakuBaseY = YAKU_BASE_Y;

        // --- 1. 標題 ---
        if (t >= T.title) {
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold 64px ${this.r.fontFamily}`;
            ctx.textAlign = "center";
            ctx.fillText("本局結束", CX, H * 0.18);
        }

        if (!result.score) return;

        // --- 資料準備 ---
        const han = result.best ? result.best.han : 0;
        const fu = result.fu;
        const scoreTotal = result.score.total;
        const isParent = (result.winnerIndex === this.r.gameState.parentIndex);

        // --- 役種排序 ---
        let sortedYakus = [];
        if (result.score.yakus?.length) {
            sortedYakus = [...result.score.yakus].sort((a, b) => {
                let ia = this.YAKU_ORDER.indexOf(a);
                let ib = this.YAKU_ORDER.indexOf(b);
                if (ia === -1) ia = 999;
                if (ib === -1) ib = 999;
                return ia - ib;
            });
        }

        // --- 滿貫級別判斷 ---
        let limitName = "";
        if (han >= 13) limitName = "累計役滿";
        else if (han >= 11) limitName = "三倍滿";
        else if (han >= 8) limitName = "倍滿";
        else if (han >= 6) limitName = "跳滿";
        else if (han >= 5) limitName = "滿貫";
        else if (!isParent && scoreTotal >= 8000) limitName = "滿貫";
        else if (isParent && scoreTotal >= 12000) limitName = "滿貫";

        // --- 最終顯示標題 ---
        let finalTitle = "";
        if (limitName) finalTitle = limitName;

        const isYakuman = finalTitle.includes("役滿");
        const isKazoeYakuman = finalTitle.includes("累計役滿");

        // --- 2. 勝者資訊 ---
        const winnerIdx = result.winnerIndex ?? 0;
        const roleText = isParent ? "親" : "子";
        const winnerName = (winnerIdx === 0) ? "玩家" : "COM";
        const winMethod = (result.winType === "tsumo") ? "自摸" : "榮和";

        if (t >= T.winner) {
            ctx.font = `bold 42px ${this.r.fontFamily}`;
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.fillText(`[${roleText}] ${winnerName} ${winMethod}`, CX, H * 0.28);
        }

        // --- 3. 役種動畫 (只觸發一次) ---
        if (sortedYakus.length && t >= T.winner && !this.resultYakuAnimated) {
            this.resultYakuAnimated = true;
            const now = performance.now();
            const lastIndex = Math.max(sortedYakus.length - 1, 0);

            this.resultYakuEndTime = now + lastIndex * 120 + 400;

            const DURATION = 400;
            const GAP = 0;

            sortedYakus.forEach((yaku, i) => {
                this.r.animations.push({
                    type: "yaku",
                    text: yaku,
                    index: i,
                    startTime: now + i * (DURATION + GAP),
                    duration: DURATION
                });
            });
        }

        if (this.resultYakuAnimated && !this.resultYakuFinished) {
            const hasYakuAnimation = this.r.animations.some(a => a.type === "yaku");
            if (!hasYakuAnimation) {
                this.resultYakuFinished = true;
                this.resultAfterYakuTime = performance.now();
            }
        }

        // --- 4. 靜態役種 (動畫結束後顯示) ---
        if (this.resultYakuFinished) {
            const { yakuLineHeight, yakuItemsPerCol, yakuColWidth } = this.RESULT_LAYOUT;
            const yakus = sortedYakus;
            const totalCols = Math.ceil(yakus.length / yakuItemsPerCol);
            const totalWidth = (Math.max(1, totalCols) - 1) * yakuColWidth;
            const baseX = CX - totalWidth / 2;

            ctx.font = `30px ${this.r.fontFamily}`;
            ctx.fillStyle = "#dddddd";
            ctx.textAlign = "center";

            yakus.forEach((yaku, i) => {
                const row = i % yakuItemsPerCol;
                const col = Math.floor(i / yakuItemsPerCol);
                const x = baseX + col * yakuColWidth;
                const y = this.resultYakuBaseY + row * yakuLineHeight;
                ctx.fillText(yaku, x, y);
            });
        }

        // --- 5. 手牌繪製 ---
        let handLeftX = null;
        if (t >= T.title) {
            handLeftX = this._drawResultHand(result, CX, HAND_Y);
        }

        // --- 6. 分數動畫 ---
        let scoreLeftText = "";
        if (isYakuman && !isKazoeYakuman) {
            scoreLeftText = `${scoreTotal} 點`;
        } else {
            scoreLeftText = `${han} 飜 ${fu} 符 ${scoreTotal} 點`;
        }

        const SCORE_DELAY = 300;

        if (
            handLeftX !== null &&
            this.resultYakuFinished &&
            !this.resultScoreAnimated &&
            this.resultAfterYakuTime &&
            performance.now() - this.resultAfterYakuTime >= SCORE_DELAY
        ) {
            this.resultScoreAnimated = true;
            this.resultScoreStartTime = performance.now();
        }

        if (this.resultScoreAnimated && !this.resultScoreFinished) {
            const dt = performance.now() - this.resultScoreStartTime;
            const ease = Math.min(dt / 400, 1);
            const limitColor = this._getLimitColor({ han, isYakuman, isKazoeYakuman });

            ctx.save();
            ctx.globalAlpha = ease;
            ctx.font = `bold 42px ${this.r.fontFamily}`;

            // 左側分數
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.fillText(scoreLeftText, handLeftX, SCORE_Y);

            // 右側級別(滿貫/役滿)
            ctx.fillStyle = limitColor;
            ctx.fillText(finalTitle, handLeftX + TITLE_OFFSET_X, SCORE_Y);

            ctx.restore();

            if (ease >= 1) this.resultScoreFinished = true;
        }

        if (this.resultScoreFinished) {
            ctx.font = `bold 42px ${this.r.fontFamily}`;
            ctx.textAlign = "left";

            ctx.fillStyle = "#ffffff";
            ctx.fillText(scoreLeftText, handLeftX, SCORE_Y);

            ctx.fillStyle = this._getLimitColor({ han, isYakuman, isKazoeYakuman });
            ctx.fillText(finalTitle, handLeftX + TITLE_OFFSET_X, SCORE_Y);

            if (this.resultScoreFinished && !this.scoreHighlightStartTime) {
                this.scoreHighlightStartTime = performance.now();
            }
            if (isYakuman || isKazoeYakuman){
                this._drawDiagonalHighlight({
                    text: finalTitle,
                    x: handLeftX + TITLE_OFFSET_X,
                    y: SCORE_Y,
                    font: `bold 42px ${this.r.fontFamily}`,
                    color: "#ffcc00",
                    startTime: this.scoreHighlightStartTime,
                    isSilver: isKazoeYakuman
                });
            }
        }

        // --- 7. 底部提示 ---
        const HINT_DELAY = 500;
        if (
            this.resultScoreFinished &&
            performance.now() - this.resultScoreStartTime >= HINT_DELAY
        ) {
            ctx.font = `24px ${this.r.fontFamily}`;
            ctx.fillStyle = "#888888";
            ctx.textAlign = "center";
            ctx.fillText("— 點擊任意處重新開始 —", CX, H * 0.9);
        }
    }

    /* =================================================================
       Helper 1: 繪製結算用手牌 (支援 誤自摸/誤榮和/一般和牌)
       ================================================================= */
    _drawResultHand(result, centerX, startY, isChombo = false) {
        // 1. 抓取主角
        const idx = (result.type === "chombo") ? result.offenderIndex : result.winnerIndex;
        const winner = this.r.gameState.players[idx];
        if (!winner) return;

        // 2. 判斷手牌狀態
        const ankanCount = winner.fulu.filter(f => f.type === "ankan").length;
        const baseLen = 13 - ankanCount * 3;
        const isHandFull = (winner.tepai.length === baseLen + 1);

        // 3. 決定「特寫牌」來源
        let standingTiles = [...winner.tepai];
        let winTile = -1;

        if (isHandFull) {
            // 【自摸 / 誤自摸】牌在手尾，拔出來特寫
            winTile = standingTiles.pop();
        } else {
            // 【榮和 / 誤榮和】牌是別人打的
            if (!isHandFull && this.r.gameState.lastDiscard) {
                winTile = this.r.gameState.lastDiscard.tile;
            } else {
                winTile = standingTiles.pop(); // 保底
            }
        }

        // 4. 計算寬度與繪製
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

        // A. 立牌
        standingTiles.forEach(t => {
            this.r.drawTile(t, currentX, startY, tileW, tileH);
            currentX += tileW + gap;
        });

        // B. 副露
        if (melds.length > 0) {
            currentX += sectionGap;
            melds.forEach(m => {
                const w = this.r._drawSingleMeld(m, currentX, startY, tileW, tileH);
                currentX += w + 10;
            });
        }

        // C. 特寫牌 (和了牌 / 錯和牌)
        currentX += sectionGap;

        // 顏色區分：錯和(紅) / 和牌(金)
        const highlightColor = isChombo ? "#ff4444" : "#ffcc00";

        this.r.drawTile(winTile, currentX, startY, tileW, tileH);
        
        // 畫框框
        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = highlightColor;
        this.ctx.strokeRect(currentX, startY, tileW, tileH);

        // 文字標示
        this.ctx.fillStyle = highlightColor;
        this.ctx.font = `bold 18px ${this.r.fontFamily}`;
        this.ctx.textAlign = "center";

        let label = isChombo ? "錯和" : "和了";
        this.r.ctx.fillText(label, currentX + tileW / 2, startY + tileH + 25);

        return handLeftX;
    }

    /* =================================================================
       Helper 2: 繪製靜態手牌 (流局模式)
       ================================================================= */
    _drawStaticHand(player, centerX, startY, faceDown = false) {
        const tiles = player.tepai;
        const melds = player.fulu || [];
        const tileW = this.r.tileWidth;
        const tileH = this.r.tileHeight;
        const gap = 2;
        const sectionGap = 20;

        // 計算寬度
        let totalWidth = tiles.length * (tileW + gap);
        if (melds.length > 0) {
            totalWidth += sectionGap;
            melds.forEach(m => totalWidth += this.r._calculateMeldWidth(m, tileW) + 10);
        }

        let currentX = centerX - (totalWidth / 2);

        // 立牌
        tiles.forEach(t => {
            this.r.drawTile(t, currentX, startY, tileW, tileH, { faceDown });
            currentX += tileW + gap;
        });

        // 副露
        if (melds.length > 0) {
            currentX += sectionGap;
            melds.forEach(m => {
                const w = this.r._drawSingleMeld(m, currentX, startY, tileW, tileH);
                currentX += w + 10;
            });
        }
    }

    /* =================================================================
       Helper 3: 繪製聽牌列表
       ================================================================= */
    _drawWaitList(waitTiles, centerX, startY, labelText) {
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

        // === 半透明底板 ===
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        ctx.restore();

        // === 標題文字 ===
        ctx.font = `bold 22px ${this.r.fontFamily}`;
        ctx.fillStyle = "#dddddd";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(labelText, centerX, boxY + paddingY);

        // === 聽牌牌張 ===
        let startX = centerX - tilesWidth / 2;
        const tileY = boxY + paddingY + labelHeight + 6;

        if (!waitTiles || waitTiles.length === 0) {
            ctx.save();
            ctx.globalAlpha = 0.30;
            this.r.drawTile(-1, centerX - tileW / 2, tileY, tileW, tileH, {
                faceDown: true
            });
            ctx.restore();
            return;
        }

        waitTiles.forEach(tile => {
            this.r.drawTile(tile, startX, tileY, tileW, tileH);
            startX += tileW + gap;
        });
    }

    /* =================================================================
       Helper 4: 取得滿貫以上文字顏色
       ================================================================= */
    _getLimitColor({ han, isYakuman, isKazoeYakuman }) {
        if (isYakuman && !isKazoeYakuman) return "#ffd700"; // 金
        if (isKazoeYakuman) return "#cfd8dc";                // 銀

        if (han >= 11) return "#c47a2c"; // 三倍滿（銅）
        if (han >= 8) return "#ab47bc"; // 倍滿（紫）
        if (han >= 6) return "#42a5f5"; // 跳滿（藍）
        if (han >= 5) return "#4caf50"; // 滿貫（綠）

        return "#ffffff"; // 白
    }

    /* =================================================================
       Helper 5: 斜向高光動畫 (純 Canvas 繪製)
       ================================================================= */
    _drawDiagonalHighlight({ text, x, y, font, color, startTime, isSilver }) {
        const ctx = this.ctx;
        const now = performance.now();

        // === 1. 量文字大小 ===
        ctx.save();
        ctx.font = font;
        const metrics = ctx.measureText(text);
        const w = metrics.width;
        const h = 48; // 字高估值（42px font）

        // === 2. 計算動畫進度（循環） ===
        const DURATION = isSilver ? 2200 : 1600;
        const t = ((now - startTime) % DURATION) / DURATION;

        // 斜線位置（從左下到右上）
        const sweepX = x - w + (w * 2) * t;

        // === 3. clip：限制只畫在文字區 ===
        ctx.beginPath();
        ctx.rect(x, y - h / 2, w, h);
        ctx.clip();

        // === 4. 建立斜向高光漸層 ===
        const grad = ctx.createLinearGradient(
            sweepX, y + h,
            sweepX + (isSilver ? 120 : 80), y - h
        );

        grad.addColorStop(0.0, "rgba(255,255,255,0)");
        grad.addColorStop(0.4, "rgba(255,255,255,0.0)");
        grad.addColorStop(0.5, "rgba(255,255,255,0.45)");
        grad.addColorStop(0.6, "rgba(255,255,255,0.0)");
        grad.addColorStop(1.0, "rgba(255,255,255,0)");

        if (isSilver) {
            grad.addColorStop(0.0, "rgba(200,220,255,0)");
            grad.addColorStop(0.45,"rgba(220,235,255,0.35)");
            grad.addColorStop(0.5, "rgba(255,255,255,0.6)");
            grad.addColorStop(0.55,"rgba(220,235,255,0.35)");
            grad.addColorStop(1.0, "rgba(200,220,255,0)");
        } else {
            grad.addColorStop(0.0, "rgba(255,200,50,0)");
            grad.addColorStop(0.45,"rgba(255,215,100,0.4)");
            grad.addColorStop(0.5, "rgba(255,255,180,0.8)");
            grad.addColorStop(0.55,"rgba(255,215,100,0.4)");
            grad.addColorStop(1.0, "rgba(255,200,50,0)");
        }

        const pulse = 1 + Math.sin(now / 300) * 0.02;
        ctx.translate(x + w / 2, y);
        ctx.scale(pulse, pulse);
        ctx.translate(-(x + w / 2), -y);

        // === 5. 用 globalCompositeOperation 疊加 ===
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = grad;
        ctx.fillRect(x - w, y - h, w * 3, h * 3);

        ctx.restore();
    }

    /* =================================================================
       重置動畫狀態 (換新的一局時呼叫)
       ================================================================= */
    _resetAnimationState() {
        this.r.animations = this.r.animations.filter(a => a.type !== "yaku");
        this.resultTimelineStart = performance.now();
        this.resultYakuAnimated = false;
        this.resultYakuFinished = false;
        this.resultYakuEndTime = null;
        this.resultAfterYakuTime = null;
        this.resultScoreAnimated = false;
        this.resultScoreFinished = false;
        this.resultScoreStartTime = 0;
        this.scoreHighlightStartTime = null;
    }
}
