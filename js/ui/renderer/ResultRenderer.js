import { RESULT_TIMING, RESULT_LAYOUT_CONFIG, YAKU_DEFS } from "./ResultConfig.js";
import { RESULT_STATE, ResultStateMachine } from "./ResultStateMachine.js";
import { ResultLayout } from "./ResultLayout.js";
import { ResultEffect } from "./ResultEffect.js";
import { ResultCache } from "./ResultCache.js";

/**
 * 負責麻將遊戲結算畫面的主渲染類別
 * 採用狀態機驅動，並將邏輯分流至 Layout、Effect、Cache 模組
 */
export class ResultRenderer {
    constructor(renderer) {
        this.r = renderer;
        this.ctx = renderer.ctx;
        
        // --- 配置參數注入 ---
        // 這樣以後只要改 ResultConfig.js，這裡就會自動同步！
        this.TIMING = RESULT_TIMING;
        this.RESULT_LAYOUT = RESULT_LAYOUT_CONFIG;
        this.YAKU_ORDER = YAKU_DEFS.ORDER;
        this.YAKUMAN_SET = YAKU_DEFS.YAKUMAN;

        // --- 核心模組初始化 ---
        this.stateMachine = new ResultStateMachine();
        this.layout       = new ResultLayout(renderer);
        this.effect       = new ResultEffect(renderer);
        this.cache        = new ResultCache();

        // --- 持久引用儲存 ---
        this._lastResultRef = null;

        // --- 初始化動畫狀態 ---
        // 呼叫這個方法來建立所有需要的動畫變數
        this._resetAnimationState();
    }

    /**
     * 重置所有動畫相關的變數與 Flag
     * 當偵測到 result 改變或需要重新播放動畫時呼叫
     */
    _resetAnimationState() {
        // 1. 狀態機歸零
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
        const roleText = isParent ? "親" : "子";
        const who      = (result.offenderIndex === 0) ? "玩家" : "COM";
        
        this._drawPenaltyInfo(`${who}(${roleText}) 罰符 `, `-${result.score.total} 點`, CX, H * 0.48);

        // 手牌與聽牌 (使用 Layout 模組)
        layout.drawWaitList(result.offender?.waits || [], CX, H * 0.58, this._getChomboLabel(result));
        this.resultHandLeftX = layout.drawResultHand(result, CX, H * 0.72, true);
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
        }

        // --- 7. HINT ---
        if (sm.state >= RESULT_STATE.HINT) {
            this._drawSubTitle("— 點擊任意處重新開始 —", CX, H * 0.9, "#888", 24);
        }
    }

    // ================================================================
    // 私有輔助方法 (Private Helpers)
    // ================================================================
    
    _enterState(state) {
        this.stateMachine.enter(state);
    }

    _drawCenteredTitle(text, x, y, size, color = "#fff") {
        this.ctx.font = `bold ${size}px ${this.r.fontFamily}`;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = "center";
        this.ctx.fillText(text, x, y);
    }

    // ================================================================
    // 私有輔助方法：讓主邏輯保持乾淨
    // ================================================================
    
    /**
    * 繪製錯和的罰符資訊 (處理不同顏色的文字組合)
    */
    _drawPenaltyInfo(textPart, numPart, x, y) {
        const { ctx, r } = this;
        ctx.font = `bold 50px ${r.fontFamily}`;
        
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
        const { r, TIMING } = this;
        if (this.resultYakuAnimated || !sortedYakus.length) return;
        
        this.resultYakuAnimated = true;
        this.resultYakuBaseY = baseY;
        
        const nowT = performance.now();
        sortedYakus.forEach((yaku, i) => {
            r.animations.push({
                type: "yaku",
                text: yaku,
                index: i,
                startTime: nowT + i * TIMING.YAKU_INTERVAL,
                duration: TIMING.YAKU_DURATION
            });
        });

        const lastIndex = sortedYakus.length - 1;
        this.resultYakuEndTime = nowT + lastIndex * TIMING.YAKU_INTERVAL + TIMING.YAKU_DURATION;
    }
    
    /**
    * 繪製靜態的「役」列表 (分欄顯示)
    */
    _drawYakuList(sortedYakus, cx) {
        const { ctx, r, RESULT_LAYOUT } = this;
        const { yakuLineHeight, yakuItemsPerCol, yakuColWidth } = RESULT_LAYOUT;
        
        const totalCols = Math.ceil(sortedYakus.length / yakuItemsPerCol);
        const totalWidth = (Math.max(1, totalCols) - 1) * yakuColWidth;
        const baseX = cx - totalWidth / 2;
        
        ctx.font = `30px ${r.fontFamily}`;
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
}
