/**
 * MahjongLogic.js
 * 僅負責「牌型是否合法」
 * 不負責役、飜、點數
 *
 * 牌表示：
 * 0~8 = 索子 1s~9s
 */

export class MahjongLogic {

    /* ======================
       公開 API
       ====================== */

    // 是否為合法和牌（14 張）
    isWinningHand(tiles) {
        if (tiles.length !== 14) return false;

        const counts = this._toCounts(tiles);

        // 七對子（七種不同對子）
        if (this._isSevenPairs(counts)) return true;

        // 九蓮寶燈 / 純正九蓮（結構判定）
        if (this._isNineGates(counts)) return true;

        // 一般型（4 面子 + 1 雀頭）
        return this._canFormStandardHand(counts);
    }

    // 回傳聽牌集合（13 張）
    getWaitTiles(tiles) {
        const waits = new Set();
        if (tiles.length !== 13) return waits;

        const baseCounts = this._toCounts(tiles);

        for (let tile = 0; tile <= 8; tile++) {
            if (baseCounts[tile] === 4) continue;

            const test = [...tiles, tile];
            if (this.isWinningHand(test)) {
                waits.add(tile);
            }
        }
        return waits;
    }

    // 是否可暗槓
    // riichiWaitSet === null → 未立直
    canAnkan(tiles, riichiWaitSet = null) {
        const counts = this._toCounts(tiles);

        for (let tile = 0; tile <= 8; tile++) {
            if (counts[tile] === 4) {

                // 未立直：一定可槓
                if (!riichiWaitSet) return true;

                // 已立直：模擬暗槓後聽牌是否相同
                const after = tiles.filter(t => t !== tile);
                const newWaits = this.getWaitTiles(after);

                if (this._sameSet(newWaits, riichiWaitSet)) {
                    return true;
                }
            }
        }
        return false;
    }

    /* ======================
       內部判定
       ====================== */

    _toCounts(tiles) {
        const counts = Array(9).fill(0);
        tiles.forEach(t => counts[t]++);
        return counts;
    }

    // 七對子：七種「不同」對子
    _isSevenPairs(counts) {
        let pairs = 0;
        for (let i = 0; i <= 8; i++) {
            if (counts[i] === 2) pairs++;
            else if (counts[i] !== 0) return false;
        }
        return pairs === 7;
    }

    // 九蓮寶燈（結構判定）
    _isNineGates(counts) {
        if (counts[0] < 3 || counts[8] < 3) return false;

        for (let i = 1; i <= 7; i++) {
            if (counts[i] < 1) return false;
        }

        const total = counts.reduce((a, b) => a + b, 0);
        return total === 14;
    }

    // 一般型：4 面子 + 1 雀頭
    _canFormStandardHand(counts) {
        for (let head = 0; head <= 8; head++) {
            if (counts[head] >= 2) {
                const copy = [...counts];
                copy[head] -= 2;

                if (this._canFormMentsu(copy)) {
                    return true;
                }
            }
        }
        return false;
    }

    _canFormMentsu(counts) {
        for (let i = 0; i <= 8; i++) {
            if (counts[i] === 0) continue;

            // 刻子
            if (counts[i] >= 3) {
                counts[i] -= 3;
                if (this._canFormMentsu(counts)) return true;
                counts[i] += 3;
            }

            // 順子
            if (i <= 6 && counts[i] > 0 && counts[i+1] > 0 && counts[i+2] > 0) {
                counts[i]--; counts[i+1]--; counts[i+2]--;
                if (this._canFormMentsu(counts)) return true;
                counts[i]++; counts[i+1]++; counts[i+2]++;
            }

            return false;
        }
        return true;
    }

    _sameSet(a, b) {
        if (a.size !== b.size) return false;
        for (const x of a) if (!b.has(x)) return false;
        return true;
    }
}
