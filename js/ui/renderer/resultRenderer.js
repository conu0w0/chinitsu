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

        // --- 優化：快取計算結果，避免每幀重算 ---
        this._cachedData = {
            sortedYakus: [],
            limitName: "",
            isYakuman: false,
            isKazoeYakuman: false,
            limitColor: "#fff"
        };

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
        this.resultLevelAnimated = false;
        this.resultLevelStartTime = 0;

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

        this.YAKUMAN_SET = new Set([
            "天和", "地和", "人和",
            "四暗刻", "四暗刻單騎",
            "綠一色", "大竹林",
            "四槓子", "金門橋",
            "九蓮寶燈", "純正九蓮寶燈",
            "石上三年",
        ]);
        
        this._cachedData.yakumanCount = yakumanCount;

        this.resultState = RESULT_STATE.INIT;
        this.stateEnterTime = 0;
        
        // 結算持久狀態
        this.resultHandLeftX = null;
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
        ctx.textBaseline = "middle";

        // 3. 檢查是否為新的一次結算（初始化動畫狀態 + 預計算資料）
        if (this._lastResultRef !== result) {
            this._lastResultRef = result;
            this._resetAnimationState(result); // 傳入 result 以進行預計算
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
        this.r.animations = this.r.animations.filter(a => a.type !== "yaku");
        this.resultTimelineStart = performance.now();
        
        this.resultYakuAnimated = false;
        this.resultYakuFinished = false;
        this.resultYakuEndTime = null;
        this.resultAfterYakuTime = null;
        
        this.resultScoreAnimated = false;
        this.resultScoreFinished = false;
        this.resultScoreStartTime = 0;
        
        this.resultLevelAnimated = false;
        this.resultLevelStartTime = 0;
        this.resultHandLeftX = null;
        
        this.scoreHighlightStartTime = null;

        // --- 資料預處理 (只做一次) ---
        // 預設值
        this._cachedData = {
            sortedYakus: [],
            limitName: "",
            isYakuman: false,
            isKazoeYakuman: false,
            limitColor: "#fff"
        };

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
            const hasYakuman = this._cachedData.sortedYakus.some(y => this.YAKUMAN_SET.has(y));

            let limitName = "";
            let yakumanCount = this._cachedData.sortedYakus.filter(y => this.YAKUMAN_SET.has(y)).length;
            
            if (hasYakuman && yakumanCount >= 2) limitName = `${yakumanCount}倍役滿`;
            else if (hasYakuman && yakumanCount === 1) limitName = "役滿";
            else if (han >= 13) limitName = "累計役滿";
            else if (han >= 11) limitName = "三倍滿";
            else if (han >= 8) limitName = "倍滿";
            else if (han >= 6) limitName = "跳滿";
            else if (han >= 5) limitName = "滿貫";
            else if (!isParent && scoreTotal >= 8000) limitName = "滿貫";
            else if (isParent && scoreTotal >= 12000) limitName = "滿貫";

            this._cachedData.limitName = limitName;
            this._cachedData.isYakuman = (limitName === "役滿");
            this._cachedData.isKazoeYakuman = (limitName === "累計役滿");
            
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

        const com = this.r.gameState.players[1];
        const comInfo = result.tenpaiInfo.find(t => t.index === 1);
        const comIsTenpai = comInfo.isTenpai;
        const comWaits = comInfo.waits;

        this._drawStaticHand(com, CX, H * 0.15, !comIsTenpai);
        this._drawWaitList(comWaits, CX, H * 0.28, comIsTenpai ? "COM 聽牌" : "COM 未聽");

        ctx.fillStyle = "#aaddff";
        ctx.font = `bold 64px ${this.r.fontFamily}`;
        ctx.fillText("荒牌流局", CX, H * 0.50);

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
        if (!result || !result.score) return;

        const ctx = this.ctx;
        const now = performance.now();
        const W = this.r.canvas.width;
        const H = this.r.canvas.height;
        const CX = W / 2;

        const HAND_Y = H * 0.68;
        const SCORE_Y = HAND_Y - 60;
        const TITLE_OFFSET_X = 520;
        const LEVEL_OFFSET_Y = 6;

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

            if (this.resultState === RESULT_STATE.TITLE) {
                if (now - this.stateEnterTime > 600) {
                    this._enterState(RESULT_STATE.WINNER);
                }
            }
        }

        // ===== WINNER =====
        if (this.resultState >= RESULT_STATE.WINNER) {
            ctx.font = `bold 42px ${this.r.fontFamily}`;
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center"; // 確保置中
            ctx.fillText(`[${roleText}] ${winnerName} ${winMethod}`, CX, H * 0.28);

            if (this.resultState === RESULT_STATE.WINNER) {
                if (now - this.stateEnterTime > 500) {
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
                        startTime: nowT + i * 400,
                        duration: 400
                    });
                });
                
                const lastIndex = sortedYakus.length - 1;
                this.resultYakuEndTime = nowT + lastIndex * 400 + 400;
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
                if (now - this.stateEnterTime > 300) {
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
                if (now - this.stateEnterTime > 300) {
                    this._enterState(RESULT_STATE.SCORE);
                }
            }
        }

        // ===== SCORE =====
        if (this.resultState >= RESULT_STATE.SCORE && this.resultHandLeftX !== null) {
            ctx.font = `bold 42px ${this.r.fontFamily}`;
            ctx.fillStyle = "#fff";
            ctx.textAlign = "left"; // 明確設定為靠左

            const scoreText = isYakuman && !isKazoeYakuman
                ? `${scoreTotal} 點`
                : `${han} 飜 ${fu} 符 ${scoreTotal} 點`;

            ctx.fillText(scoreText, this.resultHandLeftX, SCORE_Y + LEVEL_OFFSET_Y);

            
            if (this.resultState === RESULT_STATE.SCORE) {
                if (now - this.stateEnterTime > 800) {
                    this._enterState(RESULT_STATE.LEVEL);
                }
            }
        }

        // ===== LEVEL =====
        if (this.resultState >= RESULT_STATE.LEVEL && this.resultHandLeftX !== null) {
            ctx.font = `bold 42px ${this.r.fontFamily}`;
            ctx.fillStyle = limitColor; // 使用快取的顏色
            ctx.textAlign = "left"; // 確保靠左

            ctx.fillText(
                limitName,
                this.resultHandLeftX + TITLE_OFFSET_X,
                SCORE_Y + LEVEL_OFFSET_Y
            );

            if (this.scoreHighlightStartTime === null) {
                this.scoreHighlightStartTime = performance.now();
            }
            
            const isMultipleYakuman = this._cachedData.yakumanCount >= 2;

            if (isYakuman || isKazoeYakuman || isMultipleYakuman) {
                this._drawDiagonalHighlightTextOnly({
                    text: limitName,
                    x: this.resultHandLeftX + TITLE_OFFSET_X,
                    y: SCORE_Y + LEVEL_OFFSET_Y,
                    font: `bold 42px ${this.r.fontFamily}`,
                    startTime: this.scoreHighlightStartTime,
                    angle: angle: isMultipleYakuman ? -25 : -45, 
                    isSilver: isKazoeYakuman
                });
            }

            if (this.resultState === RESULT_STATE.LEVEL) {
                if (now - this.stateEnterTime > 600) {
                    this._enterState(RESULT_STATE.HINT);
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
       Helper 1: 繪製結算用手牌
       ================================================================= */
    _drawResultHand(result, centerX, startY, isChombo = false) {
        const idx = (result.type === "chombo") ? result.offenderIndex : result.winnerIndex;
        const winner = this.r.gameState.players[idx];
        if (!winner) return null;

        const ankanCount = winner.fulu.filter(f => f.type === "ankan").length;
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

    /* =================================================================
       Helper 5: 斜向高光動畫 (純 Canvas 繪製) - [漸層修正]
       ================================================================= */
    _drawDiagonalHighlightTextOnly({ text, x, y, font, startTime, angle = 45, isSilver = false }) {
        const ctx = this.ctx;
        const now = performance.now();

        // 1. 參數
        ctx.save();
        ctx.font = font;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        
        const metrics = ctx.measureText(text);
        const w = metrics.width;
        const h = 52;

        const bandWidth = Math.max(40, w * 0.35);
        const diag = Math.sqrt(w * w + h * h);
        const sweep = diag * 1.2;

        // 2. 計算動畫進度
        const DURATION = isSilver ? 2200 : 1600;
        const t = ((now - startTime) % DURATION) / DURATION;

        // 3. clip
        const rad = angle * Math.PI / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);

        const cx = x + w / 2;
        const cy = y;
        
        const ox = cx - dx * sweep + dx * sweep * 2 * t;
        const oy = cy - dy * sweep + dy * sweep * 2 * t;

        // 4. 畫漸層
        const grad = ctx.createLinearGradient(
            ox - dx * bandWidth, oy - dy * bandWidth,
            ox + dx * bandWidth, oy + dy * bandWidth
        );
        
        if (isSilver) {            
            grad.addColorStop(0, "rgba(200,220,255,0)");
            grad.addColorStop(0.45, "rgba(220,235,255,0.4)");
            grad.addColorStop(0.5, "rgba(255,255,255,0.7)");
            grad.addColorStop(0.55, "rgba(220,235,255,0.4)");
            grad.addColorStop(1, "rgba(200,220,255,0)");
        } else {
            grad.addColorStop(0, "rgba(255,200,50,0)");
            grad.addColorStop(0.45, "rgba(255,215,100,0.4)");
            grad.addColorStop(0.5, "rgba(255,255,180,0.9)");
            grad.addColorStop(0.55, "rgba(255,215,100,0.4)");
            grad.addColorStop(1, "rgba(255,200,50,0)");
        }
        
        ctx.fillStyle = grad;
        ctx.fillRect(x - w, y - h, w * 3, h * 2);
        
        // 5. 只保留文字區域
        ctx.globalCompositeOperation = "source-in";
        ctx.fillStyle = "#fff";
        ctx.fillText(text, x, y);
        
        ctx.restore();
    }       

    _enterState(state) {
        this.resultState = state;
        this.stateEnterTime = performance.now();
    }
}
