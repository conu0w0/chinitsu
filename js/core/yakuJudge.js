/**
 * yakuJudge.js
 * Step 1: 手牌拆解（不算役）
 */

export function decomposeHand(tiles) {
    const results = [];

    const originalCounts = toCounts(tiles);

    // 七對子
    const sevenPairs = checkSevenPairs(originalCounts);
    if (sevenPairs) {
        results.push({
            ...sevenPairs,
            counts: [...originalCounts]
        });
    }

    // 九蓮寶燈（含純正）
    const nineGates = checkNineGates(originalCounts);
    if (nineGates) {
        results.push({
            ...nineGates,
            counts: [...originalCounts]
        });
    }

    // 一般型（4 面子 + 1 雀頭）
    const standardHands = decomposeStandard(originalCounts);
    results.push(...standardHands);

    return results;
}

function toCounts(tiles) {
    const c = Array(9).fill(0);
    for (const t of tiles) c[t]++;
    return c;
}

function searchMentsu(counts, current, onComplete) {
    const i = counts.findIndex(v => v > 0);

    if (i === -1) {
        onComplete([...current]);
        return;
    }

    // 刻子
    if (counts[i] >= 3) {
        counts[i] -= 3;
        current.push({ type: "koutsu", tile: i });
        searchMentsu(counts, current, onComplete);
        current.pop();
        counts[i] += 3;
    }

    // 順子
    if (i <= 6 && counts[i+1] > 0 && counts[i+2] > 0) {
        counts[i]--; counts[i+1]--; counts[i+2]--;
        current.push({ type: "shuntsu", tiles: [i, i+1, i+2] });
        searchMentsu(counts, current, onComplete);
        current.pop();
        counts[i]++; counts[i+1]++; counts[i+2]++;
    }
}
