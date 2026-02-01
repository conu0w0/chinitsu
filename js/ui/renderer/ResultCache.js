export class ResultCache {
    constructor() {
        this.data = this._createDefaultCacheData();
    }

    _createDefaultCacheData() {
        return {
            sortedYakus: [],
            limitName: "",
            yakumanCount: 0,
            isYakuman: false,
            isKazoeYakuman: false,
            limitColor: "#fff",
            han: 0,
            fu: 0,
            scoreTotal: 0
        };
    }

    /**
     * 設定快取資料
     * @param {Object} result - 和牌資料
     * @param {Array<string>} YAKU_ORDER - 役種排序表
     * @param {Set<string>} YAKUMAN_SET - 役滿集合
     */
    set(result, YAKU_ORDER, YAKUMAN_SET) {
        // 1. 先重置
        const data = this._createDefaultCacheData();

        if (!result || !result.score) return;

        data.han = result.score.han || 0;
        data.fu = result.score.fu || 0;
        data.scoreTotal = result.score.total || 0;

        // --- 役種排序 ---
        if (result.score.yakus?.length) {
            this.data.sortedYakus = [...result.score.yakus].sort((a, b) => {
                let ia = YAKU_ORDER.indexOf(a);
                let ib = YAKU_ORDER.indexOf(b);
                if (ia === -1) ia = 999;
                if (ib === -1) ib = 999;
                return ia - ib;
            });
        }

        // --- 滿貫 / 役滿判定 ---
        const han = result.best?.han ?? 0;
        const scoreTotal = result.score.total;
        const winnerIndex = result.winnerIndex ?? 0;
        const isParent = (result.rParentIndex ?? winnerIndex) === 0; // 如果有 parentIndex 要自己傳入

        const yakumanCount =
            result.score?.yakumanCount ??
            result.best?.yakumanCount ??
            this.data.sortedYakus.filter(y => YAKUMAN_SET.has(y)).length;

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

        this.data.yakumanCount = yakumanCount;
        this.data.isYakuman = isYakuman;
        this.data.isKazoeYakuman = isKazoeYakuman;
        this.data.limitName = limitName;

        // --- 計算顏色 ---
        this.data.limitColor = this._getLimitColor({ han, isYakuman, isKazoeYakuman });
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
}
