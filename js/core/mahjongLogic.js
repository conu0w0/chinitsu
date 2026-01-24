/**
 * MahjongLogic.js
 * * 核心邏輯：
 * 基於 (3n + 2) 的數學規律進行判定。
 * 自動適應 0~4 次副露/暗槓後的剩餘手牌數量。
 */

export class MahjongLogic {

    /* ======================
       公開 API
       ====================== */

    /**
     * 檢查是否和牌
     * @param {Array<number>} hand - 手牌陣列
     * @param {number|null} winTile - 和了牌 (若手牌已包含則為 null)
     * @returns {boolean}
     */
    checkWin(hand, winTile = null) {
        // 1. 組合手牌
        const tiles = winTile !== null ? [...hand, winTile] : [...hand];
        const len = tiles.length;

        // 2. 數學檢查：長度必須符合 3n + 2
        // 可能長度：14, 11, 8, 5, 2
        if (len < 2 || (len - 2) % 3 !== 0) {
            return false;
        }

        const counts = this._toCounts(tiles);

        // 3. 七對子檢查 
        // 嚴格限制：必須是「門清」狀態，也就是手牌必須滿 14 張
        if (len === 14 && this._isSevenPairs(counts)) {
            return true;
        }

        // 4. 一般型檢查 (任意 n 組面子 + 1 組雀頭)
        // 這裡不需要知道 n 是多少，只要能把牌消光就是贏
        return this._canFormStandardHand(counts);
    }

    /**
     * 取得聽牌列表
     * @param {Array<number>} hand - 手牌
     * @returns {Set<number>}
     */
    getWaitTiles(hand) {
        const waits = new Set();
        const len = hand.length;

        // 數學檢查：聽牌狀態長度必須符合 3n + 1
        // 可能長度：13, 10, 7, 4, 1
        if (len < 1 || (len - 1) % 3 !== 0) {
            return waits; // 長度不對，不可能聽牌
        }

        const baseCounts = this._toCounts(hand);

        // 窮舉 1s~9s (0~8)
        for (let tile = 0; tile <= 8; tile++) {
            // 剪枝：如果手上已有 4 張，不可能聽這張 (五枚目不可能)
            if (baseCounts[tile] === 4) continue;

            // 模擬和牌：利用 checkWin 的通用邏輯
            if (this.checkWin(hand, tile)) {
                waits.add(tile);
            }
        }
        return waits;
    }

    /**
     * 判斷是否可以暗槓
     * @param {Array<number>} hand - 手牌 (包含剛摸到的牌)
     * @param {Set<number>|null} riichiWaits - 立直時的聽牌集合
     */
    canAnkan(hand, riichiWaits = null) {
        const counts = this._toCounts(hand);

        for (let tile = 0; tile <= 8; tile++) {
            // 必須持有 4 張才能暗槓
            if (counts[tile] === 4) {
                
                // 狀況 A: 沒立直 -> 允許槓
                if (!riichiWaits) return true;

                // 狀況 B: 已立直 -> 檢查槓後聽牌是否改變
                // 1. 移除 4 張 (例如 14 -> 10, 或 11 -> 7)
                const after = hand.filter(t => t !== tile);
                
                // 2. 重新計算聽牌 (getWaitTiles 會自動適應 10, 7... 張的長度)
                const newWaits = this.getWaitTiles(after);

                // 3. 比較集合
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
        // 這裡不需要檢查消了幾組，因為張數 (3n) 已經由外部長度檢查保證了
        if (i > 8) return true;

        // Try 1: 刻子
        if (counts[i] >= 3) {
            counts[i] -= 3;
            if (this._decomposeMentsu(counts)) return true;
            counts[i] += 3;
        }

        // Try 2: 順子
        if (i <= 6 && counts[i+1] > 0 && counts[i+2] > 0) {
            counts[i]--; counts[i+1]--; counts[i+2]--;
            if (this._decomposeMentsu(counts)) return true;
            counts[i]++; counts[i+1]++; counts[i+2]++;
        }

        return false;
    }
}
