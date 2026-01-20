/**
 * 取得手牌的所有和了拆解 (Agari Patterns)
 * @param {Array<number>} hand - 手牌陣列 (例如 [1, 1, 1, 2, 3, ...])
 * @returns {Array<Object>} 包含所有可能的拆解結果。如果沒和牌，回傳空陣列。
 */

export function getAgariPatterns(hand) {
    const patterns = [];
    const sortedHand = [...hand].sort((a, b) => a - b);

    // 1. 檢查七對子 (Chiitoitsu)
    if (checkChiitoitsu(sortedHand)) {
        patterns.push({
            isChiitoitsu: true,
            head: [], 
            mentsu: []
        });
    }

    // 2. 檢查標準型 (4面子 + 1雀頭)
    // 轉成計數器 (Frequency Map)
    const counts = {};
    for (let t of sortedHand) counts[t] = (counts[t] || 0) + 1;

    // 遞迴尋找所有組合
    findStandardPatterns(counts, [], null, patterns);

    return patterns;
}

/**
 * 遞迴尋找標準型組合
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

    // 2. Base Case: 如果沒有剩餘牌了 (全部分配完畢)
    if (firstTile === -1) {
        // 標準和牌檢查：必須是 4 組面子 + 1 個雀頭
        // (如果是 13 張手牌 + 1 張和了牌 = 14 張)
        if (currentHead !== null && currentMentsu.length === 4) {
            results.push({
                isChiitoitsu: false,
                head: currentHead,
                mentsu: JSON.parse(JSON.stringify(currentMentsu)) // 深拷貝
            });
        }
        return;
    }

    // 3. 嘗試拆解

    // 情況 A: 還沒有雀頭，嘗試把這張牌當雀頭 (Pair)
    if (currentHead === null) {
        if (counts[firstTile] >= 2) {
            counts[firstTile] -= 2;
            findStandardPatterns(counts, currentMentsu, [firstTile, firstTile], results);
            counts[firstTile] += 2; // Backtrack
        }
    }

    // 情況 B: 嘗試組成刻子 (Triplet)
    if (counts[firstTile] >= 3) {
        counts[firstTile] -= 3;
        currentMentsu.push({ type: 'triplet', tiles: [firstTile, firstTile, firstTile] });
        
        findStandardPatterns(counts, currentMentsu, currentHead, results);
        
        currentMentsu.pop(); // Backtrack
        counts[firstTile] += 3;
    }

    // 情況 C: 嘗試組成順子 (Run)
    // 只能是 1-7 (因為 8, 9 無法當順子開頭)
    if (firstTile <= 7) {
        if (counts[firstTile] > 0 && counts[firstTile + 1] > 0 && counts[firstTile + 2] > 0) {
            counts[firstTile]--;
            counts[firstTile + 1]--;
            counts[firstTile + 2]--;
            
            // 記錄 start 以便後續判斷嵌張/邊張
            currentMentsu.push({ type: 'run', tiles: [firstTile, firstTile + 1, firstTile + 2], start: firstTile });

            findStandardPatterns(counts, currentMentsu, currentHead, results);

            currentMentsu.pop(); // Backtrack
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
        else return false; 
    }
    return pairCount === 7;
}
