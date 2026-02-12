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
        this.resultYakuEndTime = 0;
        this.resultYakuBaseY = 0;        
        this.yakuAnimations = [];

        // 4. 分數與稱號動畫狀態
        this.resultHanfuStartTime = 0;
        this.resultScoreStartTime = 0;
        this.resultLevelStartTime = 0;
        
        this.scorePhase = 0;            // 0: 飜符淡入, 1: 顯示點數與稱號
        this.resultPointLocked = false; // 點數蓋章是否完成
        this.resultLevelLocked = false; // 稱號蓋章是否完成
    }

    /**
     * 主入口：每幀執行
     */
    draw(result) {
        if (!result) return;

        const { ctx, r } = this;

        // 資料變更偵測與快取更新
        if (this._lastResultRef !== result) {
            this._lastResultRef = result;
            this.cache.set(result, this.YAKU_ORDER, this.YAKUMAN_SET);
            this._resetAnimationState();
        }

        const W = r.viewport?.baseSize || r.config.width || 1024;
        const H = r.viewport?.baseSize || r.config.height || 1024;
        const CX = W / 2;

        ctx.save();

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";

        if (result.type !== "ryuukyoku") {
            ctx.fillStyle = "rgba(0, 0, 0, 0.86)";
            ctx.fillRect(0, 0, W, H);
        }

        const env = { W, H, CX };

        switch (result.type) {
            case "chombo":    this.drawChombo(result, env); break;
            case "ryuukyoku": this.drawRyuukyoku(result, env); break;
            default:          this.drawAgari(result, env); break;
        }

        ctx.restore();
        }

    // ================================================================
    // 渲染分支：錯和 (Chombo)
    // ================================================================
    drawChombo(result, env) {
        const { ctx, r, layout } = this;
        const { W, H, CX } = env;

        // 標題與原因
        this._drawCenteredTitle("本局結束", CX, H * 0.25, 64);
        this._drawSubTitle(`【 ${result.reason || "錯和 / 違規"} 】`, CX, H * 0.36, "#ffaaaa");

        // 罰符資訊
        const isParent = (result.offenderIndex === this.r.gameState.parentIndex);
        const who = (result.offenderIndex === 0) ? "玩家" : "COM";
        const roleText = isParent ? "[親]" : "[子]";
        const textLabel = `${roleText} ${who} 罰符`;

        this._drawPenaltyInfo(textLabel, ` ${result.score.total} 點`, CX, H * 0.48);

        // 判定：如果原因包含「振聽」，則顯示紅色標籤
        const isFuritenChombo = result.reason && result.reason.includes("振聽");
        const offenderWaits = result.offender?.waits || [];
        
        layout.drawWaitList(
            offenderWaits, 
            CX, 
            H * 0.64, 
            isFuritenChombo, // 只有真的是振聽違規時才傳 true
            true             // 錯和時啟用狀態顯示 (決定是顯示 聽牌/未聽牌/振聽)
        );

        this.resultHandLeftX = layout.drawResultHand(result, CX, H * 0.80, true);
        this.isReadyForNext = true;
    }

    // ================================================================
    // 渲染分支：流局 (Ryuukyoku)
    // ================================================================
    drawRyuukyoku(result, env) {
        const { r, layout } = this;
        const { H, CX } = env;

        const tenpaiInfo = result.tenpaiInfo ?? [];
        const comInfo = tenpaiInfo.find(t => t.index === 1) ?? {};
        const playerInfo = tenpaiInfo.find(t => t.index === 0) ?? {};

        r.gameState.players[1].handFaceDown = !comInfo.isTenpai;      // COM
        r.gameState.players[0].handFaceDown = !playerInfo.isTenpai;   // 玩家

        layout.drawWaitList(
            comInfo.waits ?? [],
            CX,
            H * 0.26,
            false, // 流局不顯示振聽邏輯
            false
        );

        layout.drawWaitList(
            playerInfo.waits ?? [],
            CX,
            H * 0.68,
            false,
            false
        );

        this._drawSubTitle("— 點擊任意處繼續 —", CX, H * 0.95, "#888", 24);

        this.isReadyForNext = true;
        }

    // ================================================================
    // 渲染分支：和牌 (Agari) - 核心狀態機邏輯
    // ================================================================
    drawAgari(result, env) {
        if (!result?.score) return;

        const { ctx, r, layout, effect, stateMachine: sm, cache } = this;
        const { W, H, CX } = env;
        const now = performance.now();
        const { sortedYakus, limitName, isYakuman, isKazoeYakuman } = cache.data;
        
        this.resultHandLeftX = layout.drawResultHand(result, CX, H * 0.80, { isChombo: false });

        // --- 0. INIT ---
        if (sm.state === RESULT_STATE.INIT) return this._enterState(RESULT_STATE.TITLE);

        // --- 1. TITLE ---
        if (sm.state >= RESULT_STATE.TITLE) {
            this._drawCenteredTitle("本局結束", CX, H * 0.22, 64);
            
            if (sm.state === RESULT_STATE.TITLE && (now - sm.stateEnterTime > this.TIMING.TITLE_TO_WINNER)) {
                this._enterState(RESULT_STATE.WINNER);
            }
        }

        // --- 2. WINNER ---
        if (sm.state >= RESULT_STATE.WINNER) {
            const winnerText = this._getWinnerText(result);
            this._drawCenteredTitle(winnerText, CX, H * 0.36, 42);
            
            if (sm.state === RESULT_STATE.WINNER && (now - sm.stateEnterTime > this.TIMING.WINNER_TO_YAKU)) {
                this._enterState(RESULT_STATE.YAKU_ANIM);
            }
        }

        // --- 3. YAKU ANIMATION ---
        if (sm.state === RESULT_STATE.YAKU_ANIM) {
            this._handleYakuAnimation(sortedYakus, H * 0.48);
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
            if (sm.state === RESULT_STATE.HAND && (now - sm.stateEnterTime > this.TIMING.HAND_TO_SCORE)) {
                this._enterState(RESULT_STATE.SCORE);
            }
        }

        // --- 6. SCORE & LEVEL ---
        if (sm.state >= RESULT_STATE.SCORE && this.resultHandLeftX !== null) {
            this._renderScoreAndLevel(now, H * 0.80 - 45);

            if (sm.state === RESULT_STATE.LEVEL && this.resultLevelLocked) {
                if (now - sm.stateEnterTime > 1500) {
                    this._enterState(RESULT_STATE.HINT);
                }
            }
        }

        // --- 7. HINT ---
        if (sm.state >= RESULT_STATE.HINT) {
            this._drawSubTitle("— 點擊任意處繼續 —", CX, H * 0.95, "#888", 24);
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

        switch (state) {
            case RESULT_STATE.YAKU_ANIM:
                this.yakuAnimations = [];
                this.resultYakuAnimated = false;
                break;
            case RESULT_STATE.SCORE:
                this._scoreLayoutCache = null;
                this.scorePhase = 0; // 重置 Phase
                // 預先算好所有階段的起點，不要在 Draw 裡面改！
                this.resultHanfuStartTime = now;
                this.resultScoreStartTime = now + 500; // 飜符播完後接點數
                this.resultLevelStartTime = now + 1000; // 點數播完後接稱號
                break;
            case RESULT_STATE.LEVEL:
                // 這裡不再改 StartTime，維持 SCORE 階段算好的
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
                const elapsed = now - anim.startTime;
                if (elapsed < 0) return; // 還沒開始

                const t = Math.min(elapsed / anim.duration, 1);
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
            if (now > this.resultYakuEndTime + 50) {
                this._enterState(RESULT_STATE.YAKU_STATIC);
            }
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
     * 繪製分數與滿貫稱號
     */
    _renderScoreAndLevel(now, scoreY) {
        const { ctx, r, layout, effect, cache, stateMachine: sm } = this;
        const result = this._lastResultRef; 
        const { han, fu, scoreTotal, limitName, isYakuman, isKazoeYakuman, limitColor } = cache.data;
        const CX = r.viewport?.baseSize / 2 || r.config.width / 2 || 512;

        const isAnyYakuman = isYakuman || isKazoeYakuman;
        
        // --- 槓子位移補償計算 ---
        let kanOffset = 0;
        if (result && result.furo) {
            // 遍歷所有副露，找出暗槓、明槓、加槓
            const kanCount = result.furo.filter(f => 
                f.type === "ankan" || f.type === "minkan" || f.type === "kakan"
            ).length;
            // 每一格槓子多一張牌跟間隙，往右補償約 45-50px (可依實際牌寬調整)
            kanOffset = kanCount * 48; 
        }

        // 加上 kanOffset 讓基準點往右移
        const anchorX = (this.resultHandLeftX !== null) ? (this.resultHandLeftX + kanOffset) : CX;
        const alignToLeft = (this.resultHandLeftX !== null);

        // 1. 初始化排版
        if (!this._scoreLayoutCache) {
            const isPureYakuman = isYakuman && !isKazoeYakuman;
            const rowItems = [];
            if (!isPureYakuman) {
                rowItems.push({ 
                    key: "hanfu", 
                    hanText: `${han} 飜`, fuText: `${fu} 符`,
                    fontHan: `bold 42px ${this.r.config.fontFamily}`, 
                    fontFu: `bold 38px ${this.r.config.fontFamily}`,
                    colorHan: "#DAA520", colorFu: "#ffffff"
                });
            }
            rowItems.push({ 
                key: "point", text: `${scoreTotal} 點`, 
                font: `bold ${isPureYakuman ? 64 : 48}px ${this.r.config.fontFamily}`, 
                color: "#ffffff",
                textAlign: "center"
            });
            if (limitName) {
                rowItems.push({ 
                    key: "level", text: limitName, 
                    font: `bold ${isPureYakuman ? 80 : 64}px ${this.r.config.fontFamily}`, 
                    color: limitColor, textAlign: "center"
                });
            }
            
            // 使用修正後的 anchorX 進行排版
            const layoutResult = layout.layoutScoreRowFixed(anchorX, scoreY, rowItems, 780, alignToLeft);
            
            // [精確位移邏輯] - 這裡是針對點數靠近飜符的微調
            const hf = layoutResult.find(i => i.key === "hanfu");
            const pt = layoutResult.find(i => i.key === "point");
            
            if (hf && pt && limitName) {
                let innerOffset = 0;

                if (limitName.includes("累計役滿") || limitName.length >= 4) {
                    innerOffset = 30;
                } 
                pt.x -= innerOffset;
            }

            this._scoreLayoutCache = layoutResult;
        }

        const row = this._scoreLayoutCache;
        ctx.save();
        ctx.textBaseline = "alphabetic";

        // --- A. 飜 & 符 (改黑框) ---
        const hanfuItem = row.find(i => i.key === "hanfu");
        if (hanfuItem) {
            const elapsed = now - this.resultHanfuStartTime;
            const DUR = 500;
            const gap = 20; 
            ctx.font = hanfuItem.fontHan;
            const hanW = ctx.measureText(hanfuItem.hanText).width;

            const drawBoth = (alpha) => {
                this._drawStaticText(hanfuItem.hanText, hanfuItem.x, hanfuItem.y, hanfuItem.fontHan, hanfuItem.colorHan, "left", 6, "black", alpha);
                this._drawStaticText(hanfuItem.fuText, hanfuItem.x + hanW + gap, hanfuItem.y, hanfuItem.fontFu, hanfuItem.colorFu, "left", 5, "black", alpha);
            };

            if (elapsed >= 0) {
                if (this.scorePhase === 0 && elapsed < DUR) {
                    drawBoth(Math.max(0, Math.min(1, elapsed / DUR)));
                } else {
                    if (this.scorePhase === 0) this.scorePhase = 1;
                    drawBoth(1);
                }
            }
        }

        // --- B. 點數 (黑框白字) ---
        const point = row.find(i => i.key === "point");
        if (point) {
            const elapsed = now - this.resultScoreStartTime;
            const sW = 8; // 黑框要粗一點才好看汪！

            if (this.resultPointLocked) {
                this._drawStaticText(point.text, point.x, point.y, point.font, point.color, point.textAlign, sW, "black");
            } else if (elapsed >= 0) {
                if (elapsed < 500) {
                    this.scorePhase = Math.max(this.scorePhase, 1);
                    effect.fadeInText({ ...point, startTime: this.resultScoreStartTime, duration: 500, strokeWidth: sW, strokeStyle: "black" });
                } else {
                    this.scorePhase = Math.max(this.scorePhase, 2);
                    this.resultPointLocked = true;
                    this._drawStaticText(point.text, point.x, point.y, point.font, point.color, point.textAlign, sW, "black");
                }
            }
        }

        // --- C. 稱號 (蓋章黑框) ---
        const level = row.find(i => i.key === "level");
        if (level) {
            const elapsed = now - this.resultLevelStartTime;
            const sW = 10; // 稱號最粗

            if (this.resultLevelLocked) {
                this._drawStaticText(level.text, level.x, level.y, level.font, level.color, level.textAlign, sW, "black");
                if (isAnyYakuman) {
                    effect.diagonalHighlight({
                        text: level.text, x: level.x, y: level.y, font: level.font,
                        textAlign: level.textAlign, startTime: this.resultLevelStartTime, isSilver: isKazoeYakuman
                    });
                }
            } else if (elapsed >= 0) {
                if (elapsed < 450) {
                    this.scorePhase = Math.max(this.scorePhase, 2);
                    effect.stampText({ ...level, startTime: this.resultLevelStartTime, duration: 450, strokeWidth: sW, strokeStyle: "black" });
                } else {
                    this.scorePhase = Math.max(this.scorePhase, 3);
                    this.resultLevelLocked = true;
                    if (sm.state < RESULT_STATE.LEVEL) this._enterState(RESULT_STATE.LEVEL);
                    this._drawStaticText(level.text, level.x, level.y, level.font, level.color, level.textAlign, sW, "black");
                }
            }
        }
        
        ctx.restore();
    }

    /**
     * 靜態文字輔助
     */
    _drawStaticText(text, x, y, font, color = "#fff", textAlign = "center", strokeWidth = 0, strokeStyle = "black", alpha = 1) {
        this.effect.drawOutlinedText({
            text, x, y, font, fill: color, align: textAlign, alpha: alpha, strokeWidth, style: strokeStyle
        });
    }
}
