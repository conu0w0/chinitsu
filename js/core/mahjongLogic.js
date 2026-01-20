/**
 * MahjongLogic.js
 * 核心邏輯：負責手牌拆解、胡牌判斷與役種計算
 */

export class MahjongLogic {
    constructor() {
        // 牌號定義：0-8(萬), 9-17(筒), 18-26(條), 27-33(字)
        this.YAKU_LIST = {
            pinhu: "平和", tanyao: "斷么九", iipeiko: "一盃口",
            haku: "白", hatsu: "發", chun: "中",
            ii_toitsu: "一姬", sanshoku: "三色同順", itsu: "一氣通貫",
            toitoi: "對對胡", chitoitsu: "七對子", kokushi: "國士無雙"
        };
    }

    /**
     * 胡牌判斷入口
     * @param {Array} tepai - 14張手牌陣列
     * @param {Object} options - 場風、自風、立直狀態等
     */
    checkHora(tepai, options = {}) {
        const counts = this._getCounts(tepai);
        
        // 1. 特殊牌型判定
        if (this.isKokushi(counts)) return { name: "國士無雙", han: 13 };
        if (this.isChitoi(counts)) return { name: "七對子", han: 2 };

        // 2. 標準拆解 (4面子 + 1雀頭)
        const solutions = this.decompose(counts);
        if (solutions.length === 0) return null;

        // 3. 役種分析 (選最高番數的一種拆解方式)
        let bestResult = null;
        for (const solution of solutions) {
            const result = this.analyzeYaku(solution, options);
            if (!bestResult || result.han > bestResult.han) {
                bestResult = result;
            }
        }
        return bestResult;
    }

    /**
     * 手牌拆解核心 (遞迴演算法)
     */
    decompose(counts) {
        const solutions = [];
        for (let i = 0; i < 34; i++) {
            if (counts[i] >= 2) {
                const copy = [...counts];
                copy[i] -= 2; // 提取雀頭
                const results = [];
                this._findMentsu(copy, 0, [], results);
                if (results.length > 0) {
                    results.forEach(res => solutions.push({ head: i, body: res }));
                }
            }
        }
        return solutions;
    }

    _findMentsu(counts, index, currentBody, results) {
        if (index === 34) {
            if (currentBody.length === 4) results.push([...currentBody]);
            return;
        }

        if (counts[index] === 0) {
            return this._findMentsu(counts, index + 1, currentBody, results);
        }

        // 嘗試提取刻子 (Koutsu)
        if (counts[index] >= 3) {
            counts[index] -= 3;
            currentBody.push({ type: 'koutsu', tile: index });
            this._findMentsu(counts, index, currentBody, results);
            currentBody.pop();
            counts[index] += 3;
        }

        // 嘗試提取順子 (Shuntsu)
        if (index < 27 && index % 9 <= 6 && counts[index] > 0 && counts[index+1] > 0 && counts[index+2] > 0) {
            counts[index]--; counts[index+1]--; counts[index+2]--;
            currentBody.push({ type: 'shuntsu', tile: index });
            this._findMentsu(counts, index, currentBody, results);
            currentBody.pop();
            counts[index]++; counts[index+1]++; counts[index+2]++;
        }
    }

    /**
     * 役種判定 (部分展示)
     */
    analyzeYaku(solution, options) {
        let han = 0;
        let yakus = [];

        // 斷么九
        if (this._isTanyao(solution)) {
            han += 1;
            yakus.push("斷么九");
        }

        // 役牌 (白發中)
        solution.body.forEach(m => {
            if (m.type === 'koutsu' && m.tile >= 31) {
                han += 1;
                yakus.push(this.YAKU_LIST[this._getTileName(m.tile)]);
            }
        });

        return { han, yakus, solution };
    }

    // --- 工具函式 ---
    _getCounts(tepai) {
        const counts = new Array(34).fill(0);
        tepai.forEach(t => { if (t !== -1) counts[t]++; });
        return counts;
    }

    _isTanyao(solution) {
        const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
        if (yaochu.includes(solution.head)) return false;
        return solution.body.every(m => {
            if (m.type === 'koutsu') return !yaochu.includes(m.tile);
            return !yaochu.includes(m.tile) && !yaochu.includes(m.tile + 2);
        });
    }

    isChitoi(counts) {
        return counts.filter(c => c === 2).length === 7;
    }

    isKokushi(counts) {
        const yaochu = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
        return yaochu.every(i => counts[i] >= 1) && yaochu.some(i => counts[i] === 2);
    }
}
