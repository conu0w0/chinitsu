/**
 * scoring.js
 * 顯示導向的計分模組（符合本遊戲特殊規則）
 */

export class Scoring {
    constructor() {
        // 固定點數對照（自摸 / 榮和同額）
        this.SCORE_TABLE = {
            mangan: 8000,
            haneman: 12000,
            baiman: 16000,
            sanbaiman: 24000,
            yakuman: 32000
        };
    }

    /**
     * 主計分入口
     */
    scoreHand({ han, fu, yakus, yakumanRank, isKazoeYakuman, isParent }) {
        // === 1. 役滿系處理 ===
        if (yakumanRank > 0) {
            return this._scoreYakuman(yakumanRank, yakus, isParent);
        }

        // === 2. 累計役滿 ===
        if (isKazoeYakuman) {
            return {
                type: "kazoe-yakuman",
                han,
                fu,
                score: this._parentAdjust(32000, isParent),
                yakus,
                display: `${han}飜 ${fu}符（累計役滿）`
            };
        }

        // === 3. 普通役（至少跳滿）
        const limit = this._getLimitByHan(han);
        const baseScore = this.SCORE_TABLE[limit];

        return {
            type: "normal",
            han,
            fu,
            score: this._parentAdjust(baseScore, isParent),
            yakus,
            limit,
            display: `${han}飜 ${fu}符`
        };
    }

    /* ======================
       內部方法
       ====================== */

    _scoreYakuman(rank, yakus, isParent) {
        const base = 32000 * rank;
        return {
            type: "yakuman",
            yakumanRank: rank,
            score: this._parentAdjust(base, isParent),
            yakus, // ⚠️ 只放役滿役
            display: this._yakumanName(rank)
        };
    }

    _getLimitByHan(han) {
        if (han >= 13) return "yakuman"; // 理論上不會走到
        if (han >= 11) return "sanbaiman";
        if (han >= 8) return "baiman";
        if (han >= 6) return "haneman";
        return "mangan"; // 最低一定跳滿
    }

    _parentAdjust(score, isParent) {
        return isParent ? score * 1.5 : score;
    }

    _yakumanName(rank) {
        if (rank === 1) return "役滿";
        if (rank === 2) return "兩倍役滿";
        if (rank === 3) return "三倍役滿";
        if (rank === 4) return "四倍役滿";
        return "役滿";
    }
}
