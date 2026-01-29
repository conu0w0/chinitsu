/**
 * js/ai/evaluateHand.js
 * 手牌評估模組：使用回溯法 (Backtracking) 計算手牌結構分
 * 這是 AI 的「直覺」，分數越高代表手牌越好
 */

/**
 * 評估手牌結構分數
 * @param {Array<number>} tiles 手牌陣列 (例如 [0, 0, 1, 2, ...])，純數字陣列
 * @returns {number} 結構分
 */
export function evaluateHandStructure(tiles) {
    // 1. 轉換成計數陣列 (0~8 各有幾張)
    const counts = Array(9).fill(0);
    for (const t of tiles) {
        if (t >= 0 && t <= 8) {
            counts[t]++;
        }
    }

    // 2. 開始遞迴搜尋最佳組合 (面子, 搭子, 對子)
    // 參數：(計數器, 面子數, 搭子數, 對子數)
    const result = searchGroups(counts, 0, 0, 0);

    // 3. 計算並回傳分數
    return calcScore(result);
}

/**
 * 遞迴搜尋：嘗試各種拆解方式 (刻子、順子、雀頭、搭子)
 */
function searchGroups(counts, mentsu, tatsu, pair) {
    let bestResult = { mentsu, tatsu, pair };
    
    // 找第一張還存在的牌 (Index 0~8)
    let i = -1;
    for (let k = 0; k < 9; k++) {
        if (counts[k] > 0) {
            i = k;
            break;
        }
    }

    // 基底條件：牌都看完了 (counts 全空)
    if (i === -1) {
        return bestResult;
    }

    // === 嘗試 1: 刻子 (i, i, i) ===
    if (counts[i] >= 3) {
        counts[i] -= 3;
        const res = searchGroups(counts, mentsu + 1, tatsu, pair);
        if (calcScore(res) > calcScore(bestResult)) bestResult = res;
        counts[i] += 3; // Backtrack (還原狀態)
    }

    // === 嘗試 2: 順子 (i, i+1, i+2) ===
    // 只有 0~6 才有可能當順子開頭
    if (i <= 6 && counts[i+1] > 0 && counts[i+2] > 0) {
        counts[i]--; counts[i+1]--; counts[i+2]--;
        const res = searchGroups(counts, mentsu + 1, tatsu, pair);
        if (calcScore(res) > calcScore(bestResult)) bestResult = res;
        counts[i]++; counts[i+1]++; counts[i+2]++;
    }

    // === 嘗試 3: 雀頭/對子 (i, i) ===
    if (counts[i] >= 2) {
        counts[i] -= 2;
        // 如果還沒有雀頭 (pair=0)，這組對子價值很高
        // 如果已經有雀頭，這組就只能算普通對子(通常不會發生在最佳解，但為了計算完整性)
        const res = searchGroups(counts, mentsu, tatsu, pair + 1);
        if (calcScore(res) > calcScore(bestResult)) bestResult = res;
        counts[i] += 2;
    }

    // === 嘗試 4: 兩面/邊張搭子 (i, i+1) ===
    if (i <= 7 && counts[i+1] > 0) {
        counts[i]--; counts[i+1]--;
        const res = searchGroups(counts, mentsu, tatsu + 1, pair);
        if (calcScore(res) > calcScore(bestResult)) bestResult = res;
        counts[i]++; counts[i+1]++;
    }

    // === 嘗試 5: 嵌張搭子 (i, i+2) ===
    if (i <= 6 && counts[i+2] > 0) {
        counts[i]--; counts[i+2]--;
        const res = searchGroups(counts, mentsu, tatsu + 1, pair);
        if (calcScore(res) > calcScore(bestResult)) bestResult = res;
        counts[i]++; counts[i+2]++;
    }

    // === 嘗試 6: 放棄這張牌 (視為孤張) ===
    // 直接處理下一張
    counts[i]--;
    const res = searchGroups(counts, mentsu, tatsu, pair);
    if (calcScore(res) > calcScore(bestResult)) bestResult = res;
    counts[i]++;

    return bestResult;
}

/**
 * 計算分數
 * 根據拆解出來的面子數、雀頭數、搭子數給分
 */
function calcScore(r) {
    let m = r.mentsu;
    let p = r.pair;
    let t = r.tatsu;

    // 修正邏輯：標準麻將結構限制 (4面子 + 1雀頭)
    // 我們要計算「有效率」的結構，多餘的搭子沒用
    
    if (m > 4) m = 4;        // 最多4組面子
    
    // 如果面子滿了，就不需要搭子了
    // 如果面子沒滿，搭子最多只能補足剩下的面子空缺
    if (m + t > 4) t = 4 - m; 
    
    if (p > 1) p = 1;        // 雀頭只要一組

    // 分數權重 (根據清一色特性調整)
    // 面子: 120 (完成的最高分)
    // 雀頭: 40  (必須要有)
    // 搭子: 20  (未來潛力)
    // 孤張: 0
    return (m * 120) + (p * 40) + (t * 20);
}
