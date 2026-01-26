/**
 * MahjongLogic.js
 * 核心邏輯：
 * 基於 (3n + 2) 的數學規律進行判定。
 * 自動適應 0~4 次副露/暗槓後的剩餘手牌數量。
 */

export class MahjongLogic {

    /* ======================
       公開 API
       ====================== */

    /**
     * 檢查是否和牌
     * @param {Array<number>} hand - 手牌陣列（不含暗槓）
     * @param {number} kanCount - 暗槓數
     * @param {number|null} winTile - 和了牌 (若手牌已包含則為 null)
     * @returns {boolean}
     */
    isWinningHand(hand, kanCount = 0, winTile = null) {
        return this.checkWin(hand, kanCount, winTile);
    }

    checkWin(hand, kanCount = 0, winTile = null) {
        if (kanCount < 0 || kanCount > 4) return false;

        // 1. 組合手牌
        const tiles = winTile !== null ? [...hand, winTile] : [...hand];
        const len = tiles.length;
        const requiredLen = 14 - kanCount * 3;

        // 2. 數學檢查：長度必須符合 3n + 2
        // 可能長度：14, 11, 8, 5, 2
        if (len !== requiredLen) {
            return false;
        }

        const counts = this._toCounts(tiles);

        // 3. 七對子檢查 
        // 嚴格限制：必須是「門清」狀態，也就是手牌必須滿 14 張 (無任何槓)
        if (len === 14 && this._isSevenPairs(counts)) {
            return true;
        }

        // 4. 一般型檢查 (任意 n 組面子 + 1 組雀頭)
        return this._canFormStandardHand(counts);
    }

    /**
     * 取得聽牌列表
     * @param {Array<number>} hand - 手牌
     * @param {number} kanCount - 暗槓數
     * @returns {Set<number>}
     */
    getWaitTiles(hand, kanCount = 0) {
        const waits = new Set();
        const len = hand.length;

        // 數學檢查：聽牌狀態長度必須符合 3n + 1
        // 可能長度：13, 10, 7, 4, 1
        const requiredLen = 13 - kanCount * 3;
        if (len !== requiredLen) {
            // console.warn(`聽牌檢查長度不符: 當前${len}, 預期${requiredLen} (kan:${kanCount})`);
            return waits;
        }

        // 窮舉 1s~9s (0~8)
        for (let tile = 0; tile <= 8; tile++) {
            // 模擬和牌：利用 checkWin 的通用邏輯
            if (this.checkWin(hand, kanCount, tile)) {
                waits.add(tile);
            }
        }
        return waits;
    }

    /**
     * 取得當前手牌中所有合法的暗槓選項
     * @param {Array<number>} tepai - 目前手牌
     * @param {number} kanCount - 目前已有的暗槓數 (修正重點：需要這個參數來計算剩餘張數)
     * @param {Set<number>|null} riichiWaitSet - 若已立直，傳入立直時的聽牌
     */
    getAnkanTiles(tepai, kanCount = 0, riichiWaitSet = null) {
        const count = new Map();
        for (const t of tepai) {
            count.set(t, (count.get(t) || 0) + 1);
        }

        const result = [];
        for (const [tile, n] of count) {
            if (n === 4) {
                // 立直後不能改變聽牌
                if (riichiWaitSet) {
                    const temp = tepai.filter(x => x !== tile);
                    
                    // 修正 1: 這裡必須傳入 kanCount + 1，因為拿掉 4 張牌後，邏輯上等於多了一次槓
                    // 例如：原本 14 張 (kan=0)，拿掉 4 張剩 10 張，getWaitTiles 預期 (13 - 1*3) = 10 張 -> 符合
                    const waits = this.getWaitTiles(temp, kanCount + 1);
                    
                    // 修正 2: 這裡原本拼寫錯誤 (_sameWaitSet -> _isSameSet)
                    if (!this._isSameSet(waits, riichiWaitSet)) continue;
                }
                result.push(tile);
            }
        }
        return result;
    }

    /**
     * 判斷是否可以暗槓 (單純回傳 Boolean)
     * @param {Array<number>} hand - 手牌 (包含剛摸到的牌)
     * @param {number} kanCount
     * @param {Set<number>|null} riichiWaits - 立直時的聽牌集合
     */
    canAnkan(hand, kanCount, riichiWaits = null) {
        const counts = this._toCounts(hand);

        for (let tile = 0; tile <= 8; tile++) {
            if (counts[tile] === 4) {
                
                // 狀況 A: 沒立直 -> 允許槓
                if (!riichiWaits) return true;

                // 狀況 B: 已立直 -> 檢查槓後聽牌是否改變
                const after = hand.filter(t => t !== tile);
                
                // 這裡你原本寫對了 (kanCount + 1)，很棒！
                const newWaits = this.getWaitTiles(after, kanCount + 1);

                if (this._isSameSet(newWaits, riichiWaits)) {
                    return true;
                }
            }
        }
        return false;
    }

    /* ======================
       內部核心演算法
       ====================== */

    _toCounts(tiles) {
        const counts = Array(9).fill(0);
        tiles.forEach(t => counts[t]++);
        return counts;
    }

    _isSameSet(a, b) {
        if (!a || !b) return false; // 防呆
        if (a.size !== b.size) return false;
        for (const x of a) if (!b.has(x)) return false;
        return true;
    }

    _isSevenPairs(counts) {
        let pairs = 0;
        for (let i = 0; i <= 8; i++) {
            if (counts[i] === 2) pairs++;
            else if (counts[i] !== 0) return false;
        }
        return pairs === 7;
    }

    _canFormStandardHand(counts) {
        // 窮舉雀頭
        for (let i = 0; i <= 8; i++) {
            if (counts[i] >= 2) {
                counts[i] -= 2; // 移除雀頭
                
                // 剩下的牌能否全部組成面子？
                if (this._decomposeMentsu(counts)) {
                    return true; 
                }
                
                counts[i] += 2; // Backtrack
            }
        }
        return false;
    }

    // 遞迴消除面子
    _decomposeMentsu(counts) {
        // 尋找第一張存在的牌
        let i = 0;
        while (i <= 8 && counts[i] === 0) i++;

        // Base Case: 牌都消光了 -> 成功
        if (i > 8) return true;

        // Try 1: 順子
        if (i <= 6 && counts[i+1] > 0 && counts[i+2] > 0) {
            counts[i]--; counts[i+1]--; counts[i+2]--;
            if (this._decomposeMentsu(counts)) return true;
            counts[i]++; counts[i+1]++; counts[i+2]++;
        }

        // Try 2: 刻子
        if (counts[i] >= 3) {
            counts[i] -= 3;
            if (this._decomposeMentsu(counts)) return true;
            counts[i] += 3;
        }

        return false;
    }
}
