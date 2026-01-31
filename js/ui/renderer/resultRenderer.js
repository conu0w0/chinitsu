const RESULT_STATE = {
    INIT: 0,
    TITLE: 1,
    WINNER: 2,
    YAKU_ANIM: 3,
    YAKU_STATIC: 4,
    HAND: 5,
    SCORE: 6,
    LEVEL: 7,
    HINT: 8
};

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

        // 快取計算結果，避免每幀重算
        this._cachedData = this._createDefaultCacheData();

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
        this.resultHanfuStartTime = 0;
        this.resultLevelAnimated = false;
        this.resultLevelStartTime = 0;
        this.scorePhase = 0;

        // 結算持久狀態
        this.resultState = RESULT_STATE.INIT;
        this.stateEnterTime = 0;
        this.resultHandLeftX = null;

        // --- 配置參數 ---
        this.RESULT_LAYOUT = {
            yakuLineHeight: 45,
            yakuItemsPerCol: 4,
            yakuColWidth: 250
        };

        this.TIMING = {
            TITLE_TO_WINNER: 600,
            WINNER_TO_YAKU: 500,
            YAKU_INTERVAL: 400,
            YAKU_DURATION: 400,
            YAKU_TO_HAND: 300,
            HAND_TO_SCORE: 300,
            PHASE0_TO_PHASE1: 600,
            SCORE_TO_LEVEL: 600,
            LEVEL_TO_HINT: 900,
            LEVEL_STAMP_DURATION: 650,
            LEVEL_STAMP_DROP: 56,
            LEVEL_HIGHLIGHT_DELAY: 150
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

        this.YAKUMAN_SET = new Set([
            "天和", "地和", "人和",
            "四暗刻", "四暗刻單騎",
            "綠一色", "大竹林",
            "四槓子", "金門橋",
            "九蓮寶燈", "純正九蓮寶燈",
            "石上三年",
        ]);
    }

    _createDefaultCacheData() {
        return {
            sortedYakus: [],
            limitName: "",
            yakumanCount: 0,
            isYakuman: false,
            isKazoeYakuman: false,
            limitColor: "#fff"
        };
    }

    /* =================================================================
       結算入口（唯一對外 API）
       ================================================================= */
    draw(result) {
        if (!result) return;

        const ctx = this.ctx;
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;

        // [安全性修正] 保存 Context 狀態，避免污染外部渲染
        ctx.save();

        // 1. 繪製半透明背景
        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.fillRect(0, 0, W, H);

        // 2. 基礎文字設定
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";

        // 3. 檢查是否為新的一次結算（初始化動畫狀態 + 預計算資料）
        if (this._lastResultRef !== result) {
            this._lastResultRef = result;
            this._resetAnimationState(result);
        }

        // 4. 根據類型分流
        if (result.type === "chombo") {
            this.drawChombo(result);
        } else if (result.type === "ryuukyoku") {
            this.drawRyuukyoku(result);
        } else {
            this.drawAgari(result);
        }

        // [安全性修正] 還原 Context 狀態
        ctx.restore();
    }

    /* =================================================================
       Helper: 重置動畫狀態 + 資料預計算 (效能優化核心)
       ================================================================= */
    _resetAnimationState(result) {
        this.resultState = RESULT_STATE.INIT;

        // 清除舊的 yaku 動畫，保留其他類型的動畫
        if (typeof this.r.removeAnimationsByType === "function") {
            this.r.removeAnimationsByType("yaku");
        } else {
            this.r.animations = (this.r.animations ?? []).filter(a => a.type !== "yaku");
        }
        
        this.resultTimelineStart = performance.now();

        this.resultYakuAnimated = false;
        this.resultYakuFinished = false;
        this.resultYakuEndTime = null;
        this.resultAfterYakuTime = null;

        this.resultScoreAnimated = false;
        this.resultScoreFinished = false;
        this.resultScoreStartTime = 0;
        this.scorePhase = 0;

        this.resultHanfuStartTime = 0;
        this.resultLevelAnimated = false;
        this.resultLevelStartTime = 0;
        this.resultHandLeftX = null;

        this.scoreHighlightStartTime = null;

        // --- 資料預處理 (只做一次) ---
        this._cachedData = this._createDefaultCacheData();

        if (result && result.score) {
            // 1. 役種排序
            if (result.score.yakus?.length) {
                this._cachedData.sortedYakus = [...result.score.yakus].sort((a, b) => {
                    let ia = this.YAKU_ORDER.indexOf(a);
                    let ib = this.YAKU_ORDER.indexOf(b);
                    if (ia === -1) ia = 999;
                    if (ib === -1) ib = 999;
                    return ia - ib;
                });
            }

            // 2. 滿貫/役滿判定
            const han = result.best?.han ?? 0;
            const scoreTotal = result.score.total;
            const isParent = (result.winnerIndex === this.r.gameState.parentIndex);

            const yakumanCount =
                result.score?.yakumanCount ??
                result.best?.yakumanCount ??
                this._cachedData.sortedYakus.filter(y => this.YAKUMAN_SET.has(y)).length;

            const isYakuman = yakumanCount >= 1;
            const isKazoeYakuman = (!isYakuman && han >= 13);

            let limitName = "";

            if (yakumanCount >= 2) limitName = `${yakumanCount}倍役滿`;
            else if (yakumanCount === 1) limitName = "役滿";
            else if (han >= 13) limitName = "累計役滿";
            else if (han >= 11) limitName = "三倍滿";
            else if (han >= 8) limitName = "倍滿";
            else if (han >= 6) limitName = "跳滿";
            else if (han >= 5) limitName = "滿貫";
            else if (!isParent && scoreTotal >= 8000) limitName = "滿貫";
            else if (isParent && scoreTotal >= 12000) limitName = "滿貫";

            this._cachedData.yakumanCount = yakumanCount;
            this._cachedData.isYakuman = isYakuman;
            this._cachedData.isKazoeYakuman = isKazoeYakuman;
            this._cachedData.limitName = limitName;

            // 3. 預計算顏色
            this._cachedData.limitColor = this._getLimitColor({
                han,
                isYakuman: this._cachedData.isYakuman,
                isKazoeYakuman: this._cachedData.isKazoeYakuman
            });
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

        const offender = result.offender;
        const chomboType = result.chomboType;
        let waits = offender?.waits || [];
        let isTenpai = offender?.isTenpai || false;
        let label = "";

        if (chomboType === "wrong_agari") label = "錯和";
        else if (chomboType === "furiten") label = "振聽";
        else if (!isTenpai) label = "未聽牌";

        ctx.fillStyle = "#ffffff";
        ctx.font = `bold 64px ${this.r.fontFamily}`;
        ctx.fillText("本局結束", CX, H * 0.25);

        const reasonText = result.reason || "錯和 / 違規";
        ctx.fillStyle = "#ffaaaa";
        ctx.font = `bold 32px ${this.r.fontFamily}`;
        ctx.fillText(`【 ${reasonText} 】`, CX, H * 0.36);

        const culpritIndex = result.offenderIndex;
        const isParent = (culpritIndex === this.r.gameState.parentIndex);
        const roleText = isParent ? "親" : "子";
        const who = (culpritIndex === 0) ? "玩家" : "COM";

        const textPart = `[${roleText}] ${who} 罰符 `;
        const numPart = `-${result.score.total} 點`;

        ctx.font = `bold 50px ${this.r.fontFamily}`;
        const textWidth = ctx.measureText(textPart).width;
        const numWidth = ctx.measureText(numPart).width;
        const totalWidth = textWidth + numWidth;

        let drawX = CX - (totalWidth / 2);
        const drawY = H * 0.48;

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(textPart, drawX, drawY);
        ctx.fillStyle = "#ff4444";
        ctx.fillText(numPart, drawX + textWidth, drawY);
        ctx.textAlign = "center";

        this._drawWaitList(waits, CX, H * 0.58, label);
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
        // 修正：原本這裡是 ?? ]; 語法錯誤
        const tenpaiInfo = result.tenpaiInfo ?? [];

        const com = this.r.gameState.players[1];
        const comInfo = tenpaiInfo.find(t => t.index === 1) ?? {};
        const comIsTenpai = !!comInfo.isTenpai;
        const comWaits = comInfo.waits;

        this._drawStaticHand(com, CX, H * 0.15, !comIsTenpai);
        this._drawWaitList(comWaits, CX, H * 0.28, comIsTenpai ? "COM 聽牌" : "COM 未聽");

        ctx.fillStyle = "#aaddff";
        ctx.font = `bold 64px ${this.r.fontFamily}`;
        ctx.fillText("荒牌流局", CX, H * 0.50);

        const player = this.r.gameState.players[0];
        const playerInfo = tenpaiInfo.find(t => t.index === 0) ?? {};
        const playerIsTenpai = playerInfo.isTenpai;
        const playerWaits = playerInfo.waits;

        this._drawWaitList(playerWaits, CX, H * 0.64, playerIsTenpai ? "玩家 聽牌" : "玩家 未聽");
        this._drawStaticHand(player, CX, H * 0.80, !playerIsTenpai);
    }

    /* =================================================================
       繪製：和牌 (Agari)
       ================================================================= */
    drawAgari(result) {
        if (!result || !result.score) return;

        const ctx = this.ctx;
        const now = performance.now();
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;
        const CX = W / 2;

        const HAND_Y = H * 0.68;
        const SCORE_Y = HAND_Y - 45;
        
        const LEVEL_FONT_SIZE = 52;

        // [效能優化] 使用快取的資料
        const { sortedYakus, limitName, isYakuman, isKazoeYakuman, limitColor } = this._cachedData;
        const han = result.best?.han ?? 0;
        const fu = result.fu ?? 0;
        const scoreTotal = result.score.total;
        const isParent = (result.winnerIndex === this.r.gameState.parentIndex);

        const winnerIdx = result.winnerIndex ?? 0;
        const roleText = isParent ? "親" : "子";
        const winnerName = (winnerIdx === 0) ? "玩家" : "COM";
        const winMethod = (result.winType === "tsumo") ? "自摸" : "榮和";

        // ===== INIT =====
        if (this.resultState === RESULT_STATE.INIT) {
            this._enterState(RESULT_STATE.TITLE);
        }

        // ===== TITLE =====
        if (this.resultState >= RESULT_STATE.TITLE) {
            ctx.font = `bold 64px ${this.r.fontFamily}`;
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText("本局結束", CX, H * 0.18);
        }

        // ===== WINNER =====
        if (this.resultState >= RESULT_STATE.WINNER) {
            ctx.font = `bold 42px ${this.r.fontFamily}`;
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.fillText(`[${roleText}] ${winnerName} ${winMethod}`, CX, H * 0.28);

            if (this.resultState === RESULT_STATE.WINNER) {
                if (now - this.stateEnterTime > this.TIMING.WINNER_TO_YAKU) {
                    this._enterState(RESULT_STATE.YAKU_ANIM);
                }
            }
        }

        // ===== YAKU_ANIM =====
        if (this.resultState === RESULT_STATE.YAKU_ANIM) {
            if (!this.resultYakuAnimated && sortedYakus.length) {
                this.resultYakuAnimated = true;
                const baseY = H * 0.38;
                this.resultYakuBaseY = baseY;

                const nowT = performance.now();
                sortedYakus.forEach((yaku, i) => {
                    this.r.animations.push({
                        type: "yaku",
                        text: yaku,
                        index: i,
                        startTime: nowT + i * this.TIMING.YAKU_INTERVAL,
                        duration: this.TIMING.YAKU_DURATION
                    });
                });

                const lastIndex = sortedYakus.length - 1;
                this.resultYakuEndTime = nowT + lastIndex * this.TIMING.YAKU_INTERVAL + this.TIMING.YAKU_DURATION;
            }

            if (sortedYakus.length === 0) {
                this._enterState(RESULT_STATE.HAND);
            } else if (
                this.resultYakuEndTime &&
                now >= this.resultYakuEndTime
            ) {
                this._enterState(RESULT_STATE.YAKU_STATIC);
            }
        }

        // ===== YAKU_STATIC =====
        if (this.resultState >= RESULT_STATE.YAKU_STATIC) {
            const { yakuLineHeight, yakuItemsPerCol, yakuColWidth } = this.RESULT_LAYOUT;
            const totalCols = Math.ceil(sortedYakus.length / yakuItemsPerCol);
            const totalWidth = (Math.max(1, totalCols) - 1) * yakuColWidth;
            const baseX = CX - totalWidth / 2;

            ctx.font = `30px ${this.r.fontFamily}`;
            ctx.fillStyle = "#ddd";
            ctx.textAlign = "center";

            sortedYakus.forEach((yaku, i) => {
                const row = i % yakuItemsPerCol;
                const col = Math.floor(i / yakuItemsPerCol);
                ctx.fillText(
                    yaku,
                    baseX + col * yakuColWidth,
                    this.resultYakuBaseY + row * yakuLineHeight
                );
            });

            if (this.resultState === RESULT_STATE.YAKU_STATIC) {
                if (now - this.stateEnterTime > this.TIMING.YAKU_TO_HAND) {
                    this._enterState(RESULT_STATE.HAND);
                }
            }
        }

        // ===== HAND =====
        if (this.resultState >= RESULT_STATE.HAND) {
            if (this.resultHandLeftX === null) {
                this.resultHandLeftX = this._drawResultHand(result, CX, HAND_Y);
            } else {
                this._drawResultHand(result, CX, HAND_Y);
            }

            if (this.resultState === RESULT_STATE.HAND) {
                if (now - this.stateEnterTime > this.TIMING.HAND_TO_SCORE) {
                    this._enterState(RESULT_STATE.SCORE);
                    this.resultHanfuStartTime = performance.now();
                    this.resultScoreStartTime = this.resultHanfuStartTime;
                    this.resultScoreAnimated = false;
                }
            }
        }

        // ===== SCORE =====
        if (this.resultState >= RESULT_STATE.SCORE && this.resultHandLeftX !== null) {                
            const isYakumanOnly = this._cachedData.isYakuman && !this._cachedData.isKazoeYakuman;
            if (isYakumanOnly) this.scorePhase = 1;
            
            const rowY = SCORE_Y;
            const rowItems = [];
            
            // --- 飜符 ---
            if (!isYakumanOnly) {
                rowItems.push({
                    key: "hanfu",
                    text: `${han} 飜 ${fu} 符`,
                    font: `bold 42px ${this.r.fontFamily}`
                });
            }
            
            // --- 點數 ---
            rowItems.push({
                key: "point",
                text: `${scoreTotal} 點`,
                font: `bold ${isYakumanOnly ? 64 : 48}px ${this.r.fontFamily}`
            });
            
            // ===== LEVEL =====
            if (this.resultState >= RESULT_STATE.LEVEL && limitName) {
                rowItems.push({
                    key: "level",
                    text: limitName,
                    font: `bold ${LEVEL_FONT_SIZE}px ${this.r.fontFamily}`
                });
            }
            
            const row = this._layoutScoreRow(this.resultHandLeftX, rowY, rowItems);
            
            // --- 飜符動畫：淡入 → 定住 ---
            const hanfu = row.find(i => i.key === "hanfu");
            if (hanfu) {
                if (this.scorePhase === 0) {
                    this._drawFadeInText({
                        text: hanfu.text,
                        x: hanfu.x,
                        y: hanfu.y,
                        font: hanfu.font,
                        startTime: this.resultHanfuStartTime
                    });                    
                    if (now - this.stateEnterTime > this.TIMING.PHASE0_TO_PHASE1) this.scorePhase = 1;                    
                } else {
                    ctx.font = hanfu.font;
                    ctx.fillStyle = "#fff";
                    ctx.textAlign = "left";
                    ctx.textBaseline = "alphabetic";
                    ctx.fillText(hanfu.text, hanfu.x, hanfu.y);
                }
            }

            // --- 點數動畫：蓋章 ---
            const point = row.find(i => i.key === "point");
            if (point) {
                this._drawStampText({
                    text: point.text,
                    x: point.x,
                    y: point.y,
                    font: point.font,
                    startTime: this.resultScoreStartTime,
                    dropHeight: 48
                });
            }
            
            // SCORE → LEVEL 推進（只做一次）
            if (this.resultState === RESULT_STATE.SCORE) {
                if (now - this.stateEnterTime > this.TIMING.SCORE_TO_LEVEL) {
                    this._enterState(RESULT_STATE.LEVEL);
                }
            }
            
            // ===== LEVEL =====
            const level = row.find(i => i.key === "level");
            if (level) {
                this._drawStampText({
                    text: level.text,
                    x: level.x,
                    y: level.y,
                    font: level.font,
                    startTime: this.stateEnterTime,
                    duration: this.TIMING.LEVEL_STAMP_DURATION,
                    dropHeight: this.TIMING.LEVEL_STAMP_DROP
                });
                
                const highlightStart = this.stateEnterTime + this.TIMING.LEVEL_HIGHLIGHT_DELAY;
                const isMultipleYakuman = this._cachedData.yakumanCount >= 2;                
                if ((isYakuman || isKazoeYakuman || isMultipleYakuman) && performance.now() >= highlightStart) {
                    this._drawDiagonalHighlightTextOnly({
                        text: level.text,
                        x: level.x,
                        y: level.y,
                        font: level.font,
                        startTime: highlightStart,
                        angle: isMultipleYakuman ? 25 : 45,
                        isSilver: isKazoeYakuman
                    });
                }
            }
        }
        
        // ===== HINT =====
        if (this.resultState >= RESULT_STATE.HINT) {
            ctx.font = `24px ${this.r.fontFamily}`;
            ctx.fillStyle = "#888";
            ctx.textAlign = "center";
            ctx.fillText("— 點擊任意處重新開始 —", CX, H * 0.9);
        }
    }

    /* =================================================================
       Helper : 繪製結算用手牌
       ================================================================= */
    _drawResultHand(result, centerX, startY, isChombo = false) {
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
        this.r.ctx.fillText(label, currentX + tileW / 2, startY + tileH + 25);

        return handLeftX;
    }

    _drawStaticHand(player, centerX, startY, faceDown = false) {
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

    _layoutScoreRow(startX, y, items, gap = 32) {
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

    _getLimitColor({ han, isYakuman, isKazoeYakuman }) {
        if (isYakuman && !isKazoeYakuman) return "#ffd700";
        if (isKazoeYakuman) return "#cfd8dc";
        if (han >= 11) return "#c47a2c";
        if (han >= 8) return "#ab47bc";
        if (han >= 6) return "#42a5f5";
        if (han >= 5) return "#4caf50";
        return "#ffffff";
    }

    _drawFadeInText({ text, x, y, font, startTime, duration = 400 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const t = Math.min(1, (now - startTime) / duration);

        ctx.save();
        ctx.font = font;
        ctx.globalAlpha = t; // 0 → 1
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    _drawStampText({ text, x, y, font, startTime, duration = 500, dropHeight = 40 }) {
        const ctx = this.ctx;
        const now = performance.now();
        const rawT = Math.min(1, (now - startTime) / duration);
        const p = rawT - 1;

        // easeOutBack（很像蓋章）
        const s = 1.70158;
        const t = p * p * ((s + 1) * p + s) + 1;

        const ty = y - dropHeight * (1 - t);
        const scale = 1.15 - 0.15 * t;

        ctx.save();
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = t;

        ctx.translate(x, ty);
        ctx.scale(scale, scale);
        ctx.fillText(text, 0, 0);

        ctx.restore();
    }

    /* =================================================================
       Helper : 斜向高光動畫
       ================================================================= */
    _drawDiagonalHighlightTextOnly({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        if (!Number.isFinite(startTime)) return;

        const ctx = this.ctx;
        const now = performance.now();

        // 1. 準備參數
        ctx.save();
        try {
            ctx.font = font;
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";

            const metrics = ctx.measureText(text);
            const fontSizeMatch = font.match(/(\d+)px/);
            const fontSize = fontSizeMatch ? Number(fontSizeMatch[1]) : 48;

            const w = metrics.width;
            const h = fontSize * 1.25;

            // 2. 先繪製純白文字 (作為 Mask 基底)
            ctx.fillStyle = "#fff";
            ctx.fillText(text, x, y);

            // 3. 設定混合模式，確保只畫在文字上
            ctx.globalCompositeOperation = "source-atop";

            const DURATION = isSilver ? 2200 : 1600;
            const t = ((now - startTime) % DURATION) / DURATION;

            const bandWidth = Math.max(40, w * 0.35);
            const diag = Math.sqrt(w * w + h * h);
            const sweep = diag * 1.2;

            const rad = angle * Math.PI / 180;
            const dx = Math.cos(rad);
            const dy = Math.sin(rad);

            const cx = x + w / 2;
            const cy = y;

            const ox = cx - dx * sweep + dx * sweep * 2 * t;
            const oy = cy - dy * sweep + dy * sweep * 2 * t;

            const grad = ctx.createLinearGradient(
                ox - dx * bandWidth, oy - dy * bandWidth,
                ox + dx * bandWidth, oy + dy * bandWidth
            );

            if (isSilver) {
                grad.addColorStop(0, "rgba(200,220,255,0)");
                grad.addColorStop(0.45, "rgba(220,235,255,0.4)");
                grad.addColorStop(0.5, "rgba(255,255,255,0.95)");
                grad.addColorStop(0.55, "rgba(220,235,255,0.4)");
                grad.addColorStop(1, "rgba(200,220,255,0)");
            } else {
                grad.addColorStop(0, "rgba(255,200,50,0)");
                grad.addColorStop(0.45, "rgba(255,215,100,0.4)");
                grad.addColorStop(0.5, "rgba(255,255,180,0.95)");
                grad.addColorStop(0.55, "rgba(255,215,100,0.4)");
                grad.addColorStop(1, "rgba(255,200,50,0)");
            }

            ctx.fillStyle = grad;
            ctx.fillRect(x, y - h / 2, w, h);
        } finally {
            // 4. 絕對要還原，否則混合模式會毀掉整個遊戲畫面
            ctx.restore();
        }
    }

    _enterState(state) {
        this.resultState = state;
        this.stateEnterTime = performance.now();
    }
}
