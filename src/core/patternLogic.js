/**
 * 取得手牌的所有可能拆解 (Patterns)
 * @param {Array<number>} hand - 手牌陣列 (例如 [1, 1, 1, 2, 3, ...])
 * @returns {Array<Object>} 包含所有可能的拆解結果
 */

export function getPatterns(hand) {
    const patterns = [];
    const sortedHand = [...hand].sort((a, b) => a - b);

    // 1. 檢查七對子 (Chiitoitsu)
    if (checkChiitoitsu(sortedHand)) {
        patterns.push({
            isChiitoitsu: true,
            head: [], // 七對子沒有定義單一雀頭，或者視意圖而定
            mentsu: []
        });
    }

    // 2. 檢查標準型 (4面子 + 1雀頭)
    // 為了效能，我們把手牌轉成計數器 (Frequency Map)
    const counts = {};
    for (let t of sortedHand) counts[t] = (counts[t] || 0) + 1;

    // 遞迴尋找所有組合
    findStandardPatterns(counts, [], null, patterns);

    return patterns;
}

/**
 * 遞迴尋找標準型組合
 * @param {Object} counts - 剩餘牌的計數器 { 1: 3, 2: 1 ... }
 * @param {Array} currentMentsu - 目前已找到的面子
 * @param {number|Array} currentHead - 目前已找到的雀頭 (null 代表還沒找)
 * @param {Array} results - 儲存結果的陣列
 */
function findStandardPatterns(counts, currentMentsu, currentHead, results) {
    // 1. 找出一張還有剩餘的最小牌
    let firstTile = -1;
    for (let i = 1; i <= 9; i++) {
        if (counts[i] > 0) {
            firstTile = i;
            break;
        }
    }

    // 2. Base Case: 如果沒有剩餘牌了 (firstTile == -1)
    if (firstTile === -1) {
        // 檢查結構是否完整 (4面子 + 1雀頭)
        // 這裡不需要檢查數量，因為我們是從 14 張牌開始減的
        // 只要能減完，結構一定是對的。
        // 但如果只有 雀頭 沒面子 (例如單釣將)，這邏輯也通。
        // 標準和牌：4組 + 1頭
        if (currentHead !== null && currentMentsu.length === 4) {
            results.push({
                isChiitoitsu: false,
                head: currentHead,
                mentsu: JSON.parse(JSON.stringify(currentMentsu)) // 深拷貝以防參考問題
            });
        }
        return;
    }

    // 3. 嘗試拆解

    // 情況 A: 還沒有雀頭，嘗試把這張牌當雀頭 (Pair)
    if (currentHead === null) {
        if (counts[firstTile] >= 2) {
            counts[firstTile] -= 2;
            // 遞迴
            findStandardPatterns(counts, currentMentsu, [firstTile, firstTile], results);
            // Backtrack (復原)
            counts[firstTile] += 2;
        }
    }

    // 情況 B: 嘗試組成刻子 (Triplet)
    if (counts[firstTile] >= 3) {
        counts[firstTile] -= 3;
        currentMentsu.push({ type: 'triplet', tiles: [firstTile, firstTile, firstTile] });
        
        findStandardPatterns(counts, currentMentsu, currentHead, results);
        
        // Backtrack
        currentMentsu.pop();
        counts[firstTile] += 3;
    }

    // 情況 C: 嘗試組成順子 (Run)
    // 只能是 1-7 (因為 8, 9 無法當順子開頭)
    if (firstTile <= 7) {
        if (counts[firstTile] > 0 && counts[firstTile + 1] > 0 && counts[firstTile + 2] > 0) {
            counts[firstTile]--;
            counts[firstTile + 1]--;
            counts[firstTile + 2]--;
            
            currentMentsu.push({ type: 'run', tiles: [firstTile, firstTile + 1, firstTile + 2], start: firstTile });

            findStandardPatterns(counts, currentMentsu, currentHead, results);

            // Backtrack
            currentMentsu.pop();
            counts[firstTile]++;
            counts[firstTile + 1]++;
            counts[firstTile + 2]++;
        }
    }
}

/**
 * 檢查七對子
 */
function checkChiitoitsu(hand) {
    if (hand.length !== 14) return false;
    
    const counts = {};
    for (let t of hand) counts[t] = (counts[t] || 0) + 1;

    let pairCount = 0;
    for (let k in counts) {
        if (counts[k] === 2) pairCount++;
        else return false; // 七對子不能有 3 張或 4 張一樣的 (除非兩對? 一般規則不允許 4 張當兩對)
        // 修正：標準七對子不允許 4 張一樣的牌當作 2 個對子。必須是 7 種不同的對子。
    }
    return pairCount === 7;
}
