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
            limitColor: "#fff"
        };
    }

    set(result, YAKU_ORDER, YAKUMAN_SET) {
        // 原 _resetAnimationState 中快取計算部分
    }
}
