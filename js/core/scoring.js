/**
 * Scoring.js
 * 負責計算胡牌點數：符數計算、翻數累加、得分換算
 */

export class Scoring {
    constructor() {
        // 基本點數對應表
        this.LIMIT_NAMES = {
            MANGAN: "滿貫",
            HANEMAN: "跳滿",
            BAIRIN: "倍滿",
            SANBAIRIN: "三倍滿",
            YAKUMAN: "役滿"
        };
    }

    /**
     * 計算最終得分
     * @param {number} fu - 符數
     * @param {number} han - 翻數
     * @param {boolean} isParent - 是否為莊家 (親家)
     * @param {boolean} isTumo - 是否為自摸
     * @returns {Object} - 包含總分與支付明細
     */
    calculateScore(fu, han, isParent, isTumo) {
        let basePoint = 0;
        let limitName = "";

        // 1. 判定點數區間 (滿貫以上不計符數)
        if (han >= 13) {
            basePoint = 8000; // 役滿
            limitName = this.LIMIT_NAMES.YAKUMAN;
        } else if (han >= 11) {
            basePoint = 6000; // 三倍滿
            limitName = this.LIMIT_NAMES.SANBAIRIN;
        } else if (han >= 8) {
            basePoint = 4000; // 倍滿
            limitName = this.LIMIT_NAMES.BAIRIN;
        } else if (han >= 6) {
            basePoint = 3000; // 跳滿
            limitName = this.LIMIT_NAMES.HANEMAN;
        } else {
            // 基本公式：符 * 2^(翻+2)
            basePoint = fu * Math.pow(2, han + 2);
            
            // 滿貫切上 (Mangan Kiriage)
            if (basePoint >= 2000 || (han === 4 && fu >= 40) || (han === 3 && fu >= 70)) {
                basePoint = 2000;
                limitName = this.LIMIT_NAMES.MANGAN;
            }
        }

        return this._formatResult(basePoint, isParent, isTumo, limitName);
    }

    /**
     * 計算符數 (Fu)
     * @param {Object} solution - MahjongLogic 拆解出的牌型
     * @param {Object} config - 包含：自摸/榮和、聽牌形式、刻子明槓/暗槓等
     */
    calculateFu(solution, config) {
        if (solution.type === "chitoi") return 25; // 七對子固定 25 符
        if (solution.type === "kokusi") return 0;  // 國士無雙不計符

        let fu = 20; // 副底 (Fu-tei)

        // 1. 門前榮和 +10 符
        if (!config.isTumo && config.isMenzen) fu += 10;
        // 2. 自摸 +2 符 (非平和牌型)
        if (config.isTumo) fu += 2;

        // 3. 雀頭符
        if ([31, 32, 33].includes(solution.head)) fu += 2; // 三元牌
        if (solution.head === config.bakaze) fu += 2;      // 場風
        if (solution.head === config.jikaze) fu += 2;      // 自風

        // 4. 面子符 (刻子、槓子)
        solution.body.forEach(m => {
            let mFu = 0;
            if (m.type === 'koutsu') mFu = 2;       // 明刻
            else if (m.type === 'ankou') mFu = 4;   // 暗刻
            else if (m.type === 'minkan') mFu = 8;  // 明槓
            else if (m.type === 'ankan') mFu = 16;  // 暗槓

            // 么九牌 (Terminal/Honor) 符數加倍
            if (this._isYaochu(m.tile)) mFu *= 2;
            fu += mFu;
        });

        // 5. 聽牌形式符 (邊張、嵌張、單騎 +2 符)
        if (config.machiType === "tanki" || config.machiType === "kanmon" || config.machiType === "penmon") {
            fu += 2;
        }

        // 進位至 10 位數
        return Math.ceil(fu / 10) * 10;
    }

    /**
     * 格式化支付結果
     */
    _formatResult(base, isParent, isTumo, limitName) {
        if (isTumo) {
            const pPay = this._roundUp(base * 2); // 子家付給莊家
            const cPay = this._roundUp(base);     // 子家付給子家
            
            if (isParent) {
                return { total: cPay * 3, detail: `每人支付 ${cPay}`, limitName };
            } else {
                return { total: pPay + cPay * 2, detail: `親家 ${pPay}, 子家 ${cPay}`, limitName };
            }
        } else {
            const total = this._roundUp(base * (isParent ? 6 : 4));
            return { total, detail: `放銃者支付 ${total}`, limitName };
        }
    }

    _roundUp(val) {
        return Math.ceil(val / 100) * 100;
    }

    _isYaochu(tile) {
        const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
        return yaochu.includes(tile);
    }
}
