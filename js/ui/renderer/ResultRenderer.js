import { RESULT_TIMING, RESULT_LAYOUT_CONFIG, YAKU_DEFS } from "./ResultConfig.js";
import { RESULT_STATE, ResultStateMachine } from "./ResultStateMachine.js";
import { ResultLayout } from "./ResultLayout.js";
import { ResultEffect } from "./ResultEffect.js";
import { ResultCache } from "./ResultCache.js";

/**
 * 負責遊戲結算畫面的主渲染類別
 * 採用狀態機驅動，並將邏輯分流至 Layout, Effect, Cache 模組
 */
export class ResultRenderer {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;

        // --- 配置參數注入 ---
        this.TIMING = RESULT_TIMING;
        this.RESULT_LAYOUT = RESULT_LAYOUT_CONFIG;
        this.YAKU_ORDER = YAKU_DEFS.ORDER;
        this.YAKUMAN_SET = YAKU_DEFS.YAKUMAN;

        // --- 核心模組初始化 ---
        this.stateMachine = new ResultStateMachine();
        this.layout = new ResultLayout(renderer);
        this.effect = new ResultEffect(renderer);
        this.cache = new ResultCache();
        
        // --- 持久引用儲存 ---
        this._lastResultRef = null;
        
        // --- 初始化動畫狀態 ---
        this.yakuAnimations = [];
        this.isReadyForNext = false;
        
        // 呼叫這個方法來建立所有需要的動畫變數
        this._resetAnimationState();
    }

    /**
     * 重置所有動畫相關的變數與 Flag
     * 當偵測到 result 改變或需要重新播放動畫時呼叫
     */
    _resetAnimationState() {
        // 1. 狀態機歸零
        this.isReadyForNext = false;
        this.stateMachine.enter(RESULT_STATE.INIT);

        // 2. 座標與排版快取重置
        this.resultHandLeftX = null;
        this._scoreLayoutCache = null;

        // 3. 役種動畫狀態
        this.resultYakuAnimated = false;
        this.resultYakuEndTime = null;
        this.resultYakuBaseY = 0;

        // 4. 分數與稱號動畫狀態
        this.resultHanfuStartTime = 0;
        this.resultScoreStartTime = 0;
        this.resultLevelStartTime = 0;
        this.scorePhase = 0;            // 0: 飜符淡入, 1: 顯示點數與稱號
        this.resultPointLocked = false; // 點數蓋章是否完成
        this.resultLevelLocked = false; // 稱號蓋章是否完成

        // 5. 其他
        this.resultYakuEndTime = 0;
        this.yakuAnimations = [];
    }

    /**
     * 主入口：每幀執行
     */
    draw(result) {
        if (!result) return;

        const { ctx, r } = this;

        ctx.save();
        
        // 1. 背景遮罩
        ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
        ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);

        // 2. 資料變更偵測與快取更新
        if (this._lastResultRef !== result) {
            this._lastResultRef = result;
            this.cache.set(result, this.YAKU_ORDER, this.YAKUMAN_SET);
            this._resetAnimationState(); // 確保重新開始
        }

        // 3. 場景分流渲染
        switch (result.type) {
            case "chombo":    this.drawChombo(result);    break;
            case "ryuukyoku": this.drawRyuukyoku(result); break;
            default:          this.drawAgari(result);     break;
        }

        ctx.restore();
    }

    // ================================================================
    // 渲染分支：錯和 (Chombo)
    // ================================================================
    drawChombo(result) {
        const { ctx, r, layout } = this;
        const [W, H, CX] = [r.canvas.width, r.canvas.height, r.canvas.width / 2];

        // 標題與原因
        this._drawCenteredTitle("本局結束", CX, H * 0.25, 64);
        this._drawSubTitle(`【 ${result.reason || "錯和 / 違規"} 】`, CX, H * 0.36, "#ffaaaa");

        // 罰符資訊
        const isParent = (result.offenderIndex === this.r.gameState.parentIndex);
        const who = (result.offenderIndex === 0) ? "玩家" : "COM";
        
        // 組合字串： [親] 玩家 罰符 ...
        const roleText = isParent ? "[親]" : "[子]";
        const textLabel = `${roleText} ${who} 罰符`;

        this._drawPenaltyInfo(textLabel, `${result.score.total} 點`, CX, H * 0.48);

        // 手牌與聽牌
        layout.drawWaitList(
            result.offender?.waits || [], 
            CX, 
            H * 0.58, 
            result.offender?.isFuriten || false // 傳入是否振聽
        );
        this.resultHandLeftX = layout.drawResultHand(result, CX, H * 0.72, true);

        this.isReadyForNext = true;
    }

    // ================================================================
    // 渲染分支：流局 (Ryuukyoku)
    // ================================================================
    drawRyuukyoku(result) {
        const { ctx, r, layout } = this;
        const [CX, H] = [r.canvas.width / 2, r.canvas.height];

        this._drawCenteredTitle("荒牌流局", CX, H * 0.46, 64, "#aaddff");

        const tenpaiInfo = result.tenpaiInfo ?? [];

        // --- COM (上方) ---
        const comInfo = tenpaiInfo.find(t => t.index === 1) ?? {};
        layout.drawStaticHand(r.gameState.players[1], CX, H * 0.15, !comInfo.isTenpai);
        layout.drawWaitList(comInfo.waits ?? [], CX, H * 0.28, comInfo.isTenpai ? "COM 聽牌" : "COM 未聽");

        // --- 玩家 (下方) ---
        const playerInfo = tenpaiInfo.find(t => t.index === 0) ?? {};
        layout.drawWaitList(playerInfo.waits ?? [], CX, H * 0.64, playerInfo.isTenpai ? "玩家 聽牌" : "玩家 未聽");
        layout.drawStaticHand(r.gameState.players[0], CX, H * 0.80, !playerInfo.isTenpai);

        this.isReadyForNext = true;
    }

    // ================================================================
    // 渲染分支：和牌 (Agari) - 核心狀態機邏輯
    // ================================================================
    drawAgari(result) {
        if (!result?.score) return;

        const { ctx, r, layout, effect, stateMachine: sm, cache } = this;
        const now = performance.now();
        const [W, H, CX] = [r.canvas.width, r.canvas.height, r.canvas.width / 2];
        const { sortedYakus, limitName, isYakuman, isKazoeYakuman } = cache.data;

        this.resultHandLeftX = layout.drawResultHand(result, CX, H * 0.68, { 
            isStatic: sm.state < RESULT_STATE.HAND// 如果還沒到手牌階段，就畫靜態的
        });

        // --- 0. INIT ---
        if (sm.state === RESULT_STATE.INIT) return this._enterState(RESULT_STATE.TITLE);

        // --- 1. TITLE ---
        if (sm.state >= RESULT_STATE.TITLE) {
            this._drawCenteredTitle("本局結束", CX, H * 0.18, 64);
            
            if (sm.state === RESULT_STATE.TITLE && (now - sm.stateEnterTime > this.TIMING.TITLE_TO_WINNER)) {
                this._enterState(RESULT_STATE.WINNER);
            }
        }

        // --- 2. WINNER ---
        if (sm.state >= RESULT_STATE.WINNER) {
            const winnerText = this._getWinnerText(result);
            this._drawCenteredTitle(winnerText, CX, H * 0.28, 42);
            
            if (sm.state === RESULT_STATE.WINNER && (now - sm.stateEnterTime > this.TIMING.WINNER_TO_YAKU)) {
                this._enterState(RESULT_STATE.YAKU_ANIM);
            }
        }

        // --- 3. YAKU ANIMATION ---
        if (sm.state === RESULT_STATE.YAKU_ANIM) {
            this._handleYakuAnimation(sortedYakus, H * 0.38);
            this._drawYakuList(sortedYakus, CX);
        }

        // --- 4. YAKU STATIC ---
        if (sm.state >= RESULT_STATE.YAKU_STATIC) {
            this._drawYakuList(sortedYakus, CX);
            
            if (sm.state === RESULT_STATE.YAKU_STATIC && (now - sm.stateEnterTime > this.TIMING.YAKU_TO_HAND)) {
                this._enterState(RESULT_STATE.HAND);
            }
        }

        // --- 5. HAND ---
        if (sm.state >= RESULT_STATE.HAND) {
            this.resultHandLeftX = layout.drawResultHand(result, CX, H * 0.68);
            
            if (sm.state === RESULT_STATE.HAND && (now - sm.stateEnterTime > this.TIMING.HAND_TO_SCORE)) {
                this._enterState(RESULT_STATE.SCORE);
            }
        }

        // --- 6. SCORE & LEVEL ---
        if (sm.state >= RESULT_STATE.SCORE && this.resultHandLeftX !== null) {
            this._renderScoreAndLevel(now, H * 0.68 - 45);

            if (sm.state === RESULT_STATE.LEVEL && this.resultLevelLocked) {
                if (now - sm.stateEnterTime > 1500) {
                    this._enterState(RESULT_STATE.HINT);
                }
            }
        }

        // --- 7. HINT ---
        if (sm.state >= RESULT_STATE.HINT) {
            this._drawSubTitle("— 點擊任意處繼續 —", CX, H * 0.9, "#888", 24);
            this.isReadyForNext = true;
        } else {
            // 尚未到達 HINT 前，禁止點擊下一局
            this.isReadyForNext = false;
        }
    }

    // ================================================================
    // 私有輔助方法 (Private Helpers)
    // ================================================================
    
    _enterState(state) {
        const now = performance.now();
        this.stateMachine.enter(state);

        // 根據進入的狀態，初始化該階段的動畫起點
        switch (state) {
            case RESULT_STATE.YAKU_ANIM:
                this.yakuAnimations = [];
                this.resultYakuAnimated = false;
                break;
            case RESULT_STATE.SCORE:
                this._scoreLayoutCache = null;
                this.resultHanfuStartTime = now;
                this.resultScoreStartTime = now + this.TIMING.PHASE0_TO_PHASE1;
                break;
            case RESULT_STATE.LEVEL:
                this.resultLevelStartTime = now;
                break;
        }
    }

    /**
     * 繪製置中的大標題
     */
    _drawCenteredTitle(text, x, y, size, color = "#fff") {
        this.ctx.font = `bold ${size}px ${this.r.config.fontFamily}`;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "alphabetic"; // 確保文字基準線統一
        this.ctx.fillText(text, x, y);
    }

    /**
     * 繪製副標題或提示文字
     */
    _drawSubTitle(text, x, y, color, size = 32) {
        this.ctx.font = `bold ${size}px ${this.r.config.fontFamily}`;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = "center";
        this.ctx.fillText(text, x, y);
    }

    /**
     * 取得錯和原因標籤
     */
    _getChomboLabel(result) {
        const offender = result.offender;
        const type = result.chomboType;

        if (type === "wrong_agari") return "錯和";
        if (type === "furiten") return "振聽";
        if (!offender?.isTenpai) return "未聽牌";
        return "違規";
    }

    /**
     * 繪製錯和的罰符資訊 (處理不同顏色的文字組合)
     */
    _drawPenaltyInfo(textPart, numPart, x, y) {
        const { ctx, r } = this;
        ctx.font = `bold 50px ${this.r.config.fontFamily}`;

        const textWidth = ctx.measureText(textPart).width;
        const numWidth = ctx.measureText(numPart).width;
        const totalWidth = textWidth + numWidth;

        let drawX = x - totalWidth / 2;

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(textPart, drawX, y);

        ctx.fillStyle = "#ff4444"; // 扣分用紅色
        ctx.fillText(numPart, drawX + textWidth, y);
        ctx.textAlign = "center"; // 恢復對齊
    }

    /**
     * 處理「役」清單的動畫觸發邏輯
     */
    _handleYakuAnimation(sortedYakus, baseY) {
        const { TIMING } = this;
        if (this.resultYakuAnimated || !sortedYakus.length) return;

        this.resultYakuAnimated = true;
        this.resultYakuBaseY = baseY;

        const nowT = performance.now();
        sortedYakus.forEach((yaku, i) => {
            this.yakuAnimations.push({
                text: yaku,
                index: i,
                startTime: nowT + i * TIMING.YAKU_INTERVAL,
                duration: TIMING.YAKU_DURATION,
            });
        });

        const lastIndex = sortedYakus.length - 1;
        this.resultYakuEndTime = nowT + lastIndex * TIMING.YAKU_INTERVAL + TIMING.YAKU_DURATION;
    }

    /**
     * 繪製靜態的「役」列表 (分欄顯示)
     */
    _drawYakuList(sortedYakus, cx) {
        const { ctx, r, RESULT_LAYOUT, stateMachine: sm } = this;
        const { yakuLineHeight, yakuItemsPerCol, yakuColWidth } = RESULT_LAYOUT;
        const now = performance.now();

        const totalCols = Math.ceil(sortedYakus.length / yakuItemsPerCol);
        const totalWidth = (Math.max(1, totalCols) - 1) * yakuColWidth;
        const baseX = cx - totalWidth / 2;

        ctx.save();
        ctx.font = `30px ${this.r.config.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";

        if (sm.state === RESULT_STATE.YAKU_ANIM) {
            // === 動態階段：處理飛入效果 ===
            this.yakuAnimations.forEach(anim => {
                if (now < anim.startTime) return;

                const t = Math.min((now - anim.startTime) / anim.duration, 1);
                const ease = 1 - Math.pow(1 - t, 3);

                const row = anim.index % yakuItemsPerCol;
                const col = Math.floor(anim.index / yakuItemsPerCol);
                const targetX = baseX + col * yakuColWidth;
                const targetY = this.resultYakuBaseY + row * yakuLineHeight;
                // X 軸偏移：從右側 40px 滑動到 0px
                const currentX = targetX + (1 - ease) * 40;

                ctx.save();
                ctx.globalAlpha = t;
                
                const isYakuman = this.YAKUMAN_SET.has(anim.text);
                
                if (isYakuman) {
                    ctx.fillStyle = "#ffcc00"; // 役滿用金黃色
                    ctx.shadowColor = "rgba(255, 200, 0, 0.6)";
                } else {
                    ctx.fillStyle = "#ffffff"; // 普通役用白色
                    ctx.shadowColor = "rgba(255, 255, 255, 0.4)";
                }
                
                ctx.shadowBlur = 10 * t;

                ctx.fillText(anim.text, currentX, targetY);
                ctx.restore();                
            });

            // 檢查是否所有役種都播完了，播完就切換狀態
            if (now > this.resultYakuEndTime) this._enterState(RESULT_STATE.YAKU_STATIC);
        } else {
            // === 靜態階段：直接畫出所有文字 ===
            sortedYakus.forEach((yaku, i) => {
                const row = i % yakuItemsPerCol;
                const col = Math.floor(i / yakuItemsPerCol);
                const targetX = baseX + col * yakuColWidth;
                const targetY = this.resultYakuBaseY + row * yakuLineHeight;

                ctx.save();
                // 檢查是否為役滿役種
                const isYakuman = this.YAKUMAN_SET.has(yaku);
                
                if (isYakuman) {
                    ctx.fillStyle = "#ffcc00"; // 役滿保持金黃色
                    ctx.shadowColor = "rgba(255, 200, 0, 0.5)";
                    ctx.shadowBlur = 8;
                } else {
                    ctx.fillStyle = "#ffffff"; // 普通役保持純白色
                }

                ctx.fillText(yaku, targetX, targetY);
                ctx.restore();
            });
        }
        ctx.restore();
    }

    /**
     * 取得勝者描述文字
     */
    _getWinnerText(result) {
        const isParent = (result.winnerIndex === this.r.gameState.parentIndex);
        const roleText = isParent ? "親" : "子";
        const winnerName = (result.winnerIndex === 0) ? "玩家" : "COM";
        const winMethod = (result.winType === "tsumo") ? "自摸" : "榮和";
        return `[${roleText}] ${winnerName} ${winMethod}`;
    }

    /**
     * 繪製分數與滿貫稱號 (含蓋章與高光動畫)
     */
    /**
     * 繪製分數與滿貫稱號 (含蓋章與高光動畫)
     */
    _renderScoreAndLevel(now, scoreY) {
        const { ctx, r, layout, effect, cache, TIMING } = this;
        const { han, fu, scoreTotal, limitName, isYakuman, isKazoeYakuman, yakumanCount, limitColor } = cache.data;

        // 1. 建立或讀取排版快取
        if (!this._scoreLayoutCache && this.resultHandLeftX !== null) {
            // 三格 vs 兩格 邏輯判斷：
            // 只有「純役滿」且「不是累計役滿」時，才採用兩格排版 (隱藏飜符)
            const isPureYakuman = isYakuman && !isKazoeYakuman;
            const rowItems = [];

            // [ x 飜 y 符 ] - 兩格模式下隱藏
            if (!isPureYakuman) {
                rowItems.push({
                    key: "hanfu",
                    text: `${han} 飜 ${fu} 符`,
                    font: `bold 42px ${this.r.config.fontFamily}`,
                    color: "#ffffff" // 飜符固定白色
                });
            }

            // [ z 點 ]
            rowItems.push({
                key: "point",
                text: `${scoreTotal} 點`,
                // 兩格模式下字體放大一點
                font: `bold ${isPureYakuman ? 64 : 48}px ${this.r.config.fontFamily}`,
                // 點數套色邏輯：役滿或累計役滿 (han >= 13) 則套用 limitColor
                color: (isYakuman || han >= 13) ? limitColor : "#ffffff"
            });

            // [ LEVEL ]
            if (limitName) {
                rowItems.push({
                    key: "level",
                    text: limitName,
                    font: `bold 52px ${this.r.config.fontFamily}`,
                    color: limitColor, // 稱號永遠套色
                    reserved: true 
                });
            }

            // 呼叫 layout 計算座標 (gap 可以設為 40 讓間距大一點更美觀)
            this._scoreLayoutCache = layout.layoutScoreRow(this.resultHandLeftX, scoreY, rowItems, 40);
            
            // 如果是兩格模式，直接跳過 Phase 0 (飜符淡入)
            if (isPureYakuman) this.scorePhase = 1;
        }

        // --- 以下繪製邏輯 (Phase 0, 1, Level) 與之前相同，確保傳入正確的 color 參數 ---
        const row = this._scoreLayoutCache;
        if (!row) return;

        // 2. 飜符 (Phase 0)
        const hanfu = row.find(i => i.key === "hanfu");
        if (hanfu) {
            if (this.scorePhase === 0) {
                effect.fadeInText({ ...hanfu, startTime: this.resultHanfuStartTime });
                if (now - this.resultHanfuStartTime > TIMING.PHASE0_TO_PHASE1) this.scorePhase = 1;
            } else {
                this._drawStaticText(hanfu.text, hanfu.x, hanfu.y, hanfu.font, hanfu.color);
            }
        }

        // 3. 點數 (Phase 1)
        const point = row.find(i => i.key === "point");
        if (point && this.scorePhase >= 1) {
            if (!this.resultPointLocked) {
                effect.stampText({ ...point, startTime: this.resultScoreStartTime });
                if (now - this.resultScoreStartTime >= 500) {
                    this.resultPointLocked = true;
                    this._enterState(RESULT_STATE.LEVEL);
                }
            } else {
                this._drawStaticText(point.text, point.x, point.y, point.font, point.color);
            }
        }

        // 4. 稱號 (Level)
        const level = row.find(i => i.key === "level");
        if (level && this.stateMachine.state >= RESULT_STATE.LEVEL) {
            if (!this.resultLevelLocked) {
                effect.stampText({ ...level, startTime: this.resultLevelStartTime, duration: TIMING.LEVEL_STAMP_DURATION });
                if (now - this.resultLevelStartTime >= TIMING.LEVEL_STAMP_DURATION) this.resultLevelLocked = true;
            } else {
                this._drawStaticText(level.text, level.x, level.y, level.font, level.color);

                // 役滿高光
                const highlightStart = this.resultLevelStartTime + TIMING.LEVEL_HIGHLIGHT_DELAY;
                if ((isYakuman || isKazoeYakuman) && now >= highlightStart) {
                    effect.diagonalHighlight({
                        ...level,
                        startTime: highlightStart,
                        angle: yakumanCount >= 2 ? 25 : 45,
                        isSilver: isKazoeYakuman
                    });
                }
            }
        }
    }

    /**
     * 內部的靜態文字繪製輔助
     */
    _drawStaticText(text, x, y, font, color = "#fff") {
        this.ctx.save();
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "alphabetic";
        
        // 如果是特殊顏色（非白色），加一點點發光感
        if (color !== "#fff" && color !== "#ffffff") {
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 10;
        }

        this.ctx.fillText(text, x, y);
        this.ctx.restore();
    }
}
