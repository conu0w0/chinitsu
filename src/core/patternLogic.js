/**
 * 取得所有可能的和牌拆解模式 (不含七對子，七對子由外層判斷)
 * @param {Array<number>} tiles - 含和了牌的 14 張牌 (sorted)
 * @param {Array} ankanTiles - 已暗槓的牌型 (視為鎖定的刻子/槓子)
 * @returns {Array} 拆解結果列表
 */
export function getAgariPatterns(tiles, ankanTiles = []) {
    const tileCount = countTiles(tiles);
    const patterns = [];

    // 先把暗槓轉換成固定的面子格式
    const fixedMentsu = ankanTiles.map(kan => ({
        type: 'triplet',
        tiles: kan, // e.g. [1,1,1,1]
        isKan: true,
        ankan: true,
        start: kan[0]
    }));

    // 計算手牌中還需要拆解的牌 (扣除暗槓)
    // 注意：這裡假設傳入的 tiles 已經包含了暗槓的牌，如果 tiles 不含暗槓，請調整
    // 一般來說 tiles 陣列包含所有牌，我們需要先把暗槓的牌扣掉再來做拆解
    const remainingTiles = [...tiles];
    // 簡單過濾掉暗槓的牌 (這邊假設 ankanTiles 是具體的牌陣列)
    for (const kan of ankanTiles) {
        for (const t of kan) {
            const idx = remainingTiles.indexOf(t);
            if (idx > -1) remainingTiles.splice(idx, 1);
        }
    }
    
    // 剩下的牌進行標準拆解 (4面子+1雀頭 - 已有槓子數)
    // 1. 嘗試每一種可能的雀頭 (Head)
    const uniqueTiles = [...new Set(remainingTiles)];
    
    for (const head of uniqueTiles) {
        if (countInHand(remainingTiles, head) >= 2) {
            // 移除雀頭
            const currentTiles = removeTiles([...remainingTiles], [head, head]);
            
            // 遞迴拆解剩餘面子
            const results = splitMentsu(currentTiles);
            
            // 組合結果
            for (const res of results) {
                patterns.push({
                    head: head,
                    mentsu: [...fixedMentsu, ...res] // 合併暗槓與拆解出的面子
                });
            }
        }
    }

    return patterns;
}

// 遞迴拆解面子 (Depth-First Search)
function splitMentsu(tiles) {
    // 終止條件：沒有牌了，代表拆解成功，回傳一個空的組合陣列
    if (tiles.length === 0) return [[]];

    const results = [];
    const first = tiles[0]; // 取第一張牌作為基準

    // 嘗試拆刻子 (Triplet)
    if (countInHand(tiles, first) >= 3) {
        const nextTiles = removeTiles([...tiles], [first, first, first]);
        const subResults = splitMentsu(nextTiles);
        for (const sub of subResults) {
            results.push([{ type: 'triplet', tiles: [first, first, first], start: first }, ...sub]);
        }
    }

    // 嘗試拆順子 (Run)
    if (includesAll(tiles, [first, first + 1, first + 2])) {
        const nextTiles = removeTiles([...tiles], [first, first + 1, first + 2]);
        const subResults = splitMentsu(nextTiles);
        for (const sub of subResults) {
            results.push([{ type: 'run', tiles: [first, first + 1, first + 2], start: first }, ...sub]);
        }
    }

    return results;
}

// 輔助：計算某張牌數量
function countInHand(tiles, tile) {
    let c = 0;
    for (let t of tiles) if (t === tile) c++;
    return c;
}

// 輔助：移除指定的一組牌
function removeTiles(source, toRemove) {
    const res = [...source];
    for (const t of toRemove) {
        const idx = res.indexOf(t);
        if (idx === -1) return []; // Should not happen in correct logic
        res.splice(idx, 1);
    }
    return res;
}

// 輔助：檢查是否包含所有指定牌
function includesAll(source, targets) {
    const temp = [...source];
    for (const t of targets) {
        const idx = temp.indexOf(t);
        if (idx === -1) return false;
        temp.splice(idx, 1);
    }
    return true;
}

// 輔助：全牌計數
function countTiles(arr) {
    const c = {};
    for (const x of arr) c[x] = (c[x] || 0) + 1;
    return c;
}patternLogic.js
