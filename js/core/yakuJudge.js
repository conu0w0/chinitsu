/**
 * yakuJudge.js
 */

export function decomposeHand(tiles, ankanTiles = []) {
    const results = [];
    const originalCounts = toCounts(tiles);

    const countsAfterKan = applyAnkan(originalCounts, ankanTiles);

    if (ankanTiles.length === 0) {
        const sevenPairs = checkSevenPairs(countsAfterKan);
        if (sevenPairs) {
            results.push({ ...sevenPairs, counts: [...originalCounts] });
        }

        const nineGates = checkNineGates(countsAfterKan);
        if (nineGates) {
            results.push({ ...nineGates, counts: [...originalCounts] });
        }
    }

    const standardHands = decomposeStandard(
        countsAfterKan,
        ankanTiles,
        originalCounts
    );
    results.push(...standardHands);

    return results;
}

function toCounts(tiles) {
    const c = Array(9).fill(0);
    for (const t of tiles) c[t]++;
    return c;
}

function applyAnkan(counts, ankanTiles) {
    const c = [...counts];
    for (const tile of ankanTiles) {
        c[tile] -= 4;
        if (c[tile] < 0) {
            throw new Error("Invalid ankan state");
        }
    }
    return c;
}

/* ===== 七對子 ===== */
function checkSevenPairs(counts) {
    let pairCount = 0;
    for (let i = 0; i <= 8; i++) {
        if (counts[i] === 2) pairCount++;
        else if (counts[i] !== 0) return null;
    }
    if (pairCount !== 7) return null;

    return {
        type: "sevenPairs",
        pair: null,
        mentsu: [],
        meta: {}
    };
}

/* ===== 九蓮寶燈 ===== */
function checkNineGates(counts) {
    if (counts[0] < 3 || counts[8] < 3) return null;
    for (let i = 1; i <= 7; i++) {
        if (counts[i] < 1) return null;
    }

    if (counts.reduce((a, b) => a + b, 0) !== 14) return null;

    let extra = -1;
    for (let i = 0; i <= 8; i++) {
        const base = (i === 0 || i === 8) ? 3 : (i >= 1 && i <= 7) ? 1 : 0;
        if (counts[i] > base) {
            if (counts[i] === base + 1 && extra === -1) extra = i;
            else return null;
        }
    }

    return {
        type: "nineGates",
        pair: null,
        mentsu: [],
        meta: { isPureNineGates: extra !== -1 }
    };
}

/* ===== 一般型 ===== */
function decomposeStandard(countsAfterKan, ankanTiles, originalCounts) {
    const results = [];

    const totalTiles = countsAfterKan.reduce((a,b) => a+b, 0);
    const needMentsu = (totalTiles - 2) / 3;
    if (!Number.isInteger(needMentsu) || needMentsu < 0) {
        return [];
    }
    

    for (let head = 0; head <= 8; head++) {
        if (countsAfterKan[head] >= 2) {
            const counts = [...countsAfterKan];
            counts[head] -= 2;

            searchMentsuWithLimit(
                counts,
                [],
                needMentsu,
                (mentsu) => {
                    const ankanMentsu = ankanTiles.map(t => ({
                        type: "ankan",
                        tile: t
                    }));

                    results.push({
                        type: "standard",
                        pair: head,
                        mentsu: [...ankanMentsu, ...mentsu],
                        meta: {
                            kanCount: ankanTiles.length
                        },
                        counts: [...originalCounts]
                    });
                }
            );
        }
    }
    return results;
}


/* ===== 面子遞迴 ===== */
function searchMentsuWithLimit(counts, current, need, onComplete) {
    if (current.length === need) {
        if (counts.every(v => v === 0)) {
            onComplete([...current]);
        }
        return;
    }

    const i = counts.findIndex(v => v > 0);
    if (i === -1) return;

    // 刻子
    if (counts[i] >= 3) {
        counts[i] -= 3;
        current.push({ type: "koutsu", tile: i });
        searchMentsuWithLimit(counts, current, need, onComplete);
        current.pop();
        counts[i] += 3;
    }

    // 順子
    if (i <= 6 && counts[i+1] > 0 && counts[i+2] > 0) {
        counts[i]--; counts[i+1]--; counts[i+2]--;
        current.push({ type: "shuntsu", tiles: [i, i+1, i+2] });
        searchMentsuWithLimit(counts, current, need, onComplete);
        current.pop();
        counts[i]++; counts[i+1]++; counts[i+2]++;
    }
}

/**
 * 役滿役種
 */

export function checkYakuman(pattern, ctx) {
    const yakus = [];
    let rank = 0;

    for (const group of YAKUMAN_GROUPS) {
        for (const fn of group) {
            const result = fn(pattern, ctx);
            if (result) {
                yakus.push(result.name);
                rank += result.rank;
                break;
            }
        }
    }

    if (rank === 0) return null;

    return {
        yakumanRank: rank,
        yakus
    };
}

function checkTenhou(_, ctx) {
    return ctx.tenhou ? { name: "天和", rank: 1 } : null;
}

function checkChiihou(_, ctx) {
    return ctx.chiihou ? { name: "地和", rank: 1 } : null;
}

function checkRenhou(_, ctx) {
    return ctx.renhou ? { name: "人和", rank: 1 } : null;
}

function checkNineGatesYakuman(pattern) {
    return pattern.type === "nineGates"
        ? { name: "九蓮寶燈", rank: 1 }
        : null;
}

function checkPureNineGates(pattern) {
    return pattern.type === "nineGates" && pattern.meta.isPureNineGates
        ? { name: "純正九蓮寶燈", rank: 2 }
        : null;
}

function checkFourConcealedTriplesTanki(pattern, ctx) {
    if (pattern.type !== "standard") return null;

    const koutsu = pattern.mentsu.filter(m => m.type === "koutsu").length;
    if (koutsu !== 4) return null;

    const isTanki =
        ctx.winType === "ron" &&
        ctx.winTile === pattern.pair;

    return isTanki ? { name: "四暗刻單騎", rank: 2 } : null;
}

function checkFourConcealedTriples(pattern) {
    if (pattern.type !== "standard") return null;

    const koutsu = pattern.mentsu.filter(m => m.type === "koutsu").length;
    return koutsu === 4 ? { name: "四暗刻", rank: 1 } : null;
}

function checkFourKans(pattern) {
    const kanCount = pattern.mentsu.filter(m => m.type === "ankan").length;
    return kanCount === 4 ? { name: "四槓子", rank: 1 } : null;
}

function checkAllGreen(pattern) {
    const greens = new Set([1, 2, 3, 5, 7]); // 2s 3s 4s 6s 8s
    for (let i = 0; i <= 8; i++) {
        if (pattern.counts[i] > 0 && !greens.has(i)) {
            return null;
        }
    }
    return { name: "綠一色", rank: 1 };
}

function checkDaiChikurin(pattern) {
    const counts = pattern.counts;

    // 必須剛好 14 張
    const total = counts.reduce((a, b) => a + b, 0);
    if (total !== 14) return null;

    for (let i = 0; i <= 8; i++) {
        // 1s / 9s 不能存在
        if ((i === 0 || i === 8) && counts[i] !== 0) {
            return null;
        }

        // 2s ~ 8s 必須剛好各 2 張
        if (i >= 1 && i <= 7 && counts[i] !== 2) {
            return null;
        }
    }

    return { name: "大竹林", rank: 1 };
}

function checkGoldenGateBridge(pattern) {
    if (pattern.type !== "standard") return null;

    const required = [
        [0,1,2],
        [2,3,4],
        [4,5,6],
        [6,7,8]
    ];

    const shuntsu = pattern.mentsu
        .filter(m => m.type === "shuntsu")
        .map(m => m.tiles.join());

    const ok = required.every(seq =>
        shuntsu.includes(seq.join())
    );

    return ok ? { name: "金門橋", rank: 1 } : null;
}

function checkIshiNoUeNiSanNen(_, ctx) {
    if (
        ctx.doubleRiichi &&
        (ctx.haitei || ctx.houtei)
    ) {
        return { name: "石上三年", rank: 1 };
    }
    return null;
}

const YAKUMAN_GROUPS = [
    // 天地人和
    [checkTenhou],
    [checkChiihou],
    [checkRenhou],

    // 九蓮系
    [checkPureNineGates, checkNineGatesYakuman],

    // 四暗刻系
    [checkFourConcealedTriplesTanki, checkFourConcealedTriples],

    // 其他單體
    [checkFourKans],
    [checkAllGreen],
    [checkGoldenGateBridge],
    [checkDaiChikurin],
    [checkIshiNoUeNiSanNen]
];

/**
 * 普通役種
 */

export function checkNormalYakus(pattern, ctx) {
    const yakus = [];
    let han = 0;

    // === 有順序與包含關係的役 ===
    for (const group of NORMAL_YAKU_GROUPS) {
        for (const fn of group) {
            const y = fn(pattern, ctx);
            if (y) {
                yakus.push(y);
                han += y.han;
                break; // 同族只取一個
            }
        }
    }

    // === 可自由疊加的役 ===
    for (const fn of EXTRA_YAKUS) {
        const y = fn(pattern, ctx);
        if (y) {
            yakus.push(y);
            han += y.han;
        }
    }

    return {
        han,
        yakus,
        isKazoeYakuman: han >= 13
    };
}

function checkRiichi(_, ctx) {
    return ctx.riichi ? { name: "立直", han: 1 } : null;
}

function checkIppatsu(_, ctx) {
    return ctx.ippatsu ? { name: "一發", han: 1 } : null;
}

function checkMenzenTsumo(_, ctx) {
    return ctx.winType === "tsumo" ? { name: "門前清自摸和", han: 1 } : null;
}

function checkTanyao(pattern) {
    for (let i = 0; i <= 8; i++) {
        if ((i === 0 || i === 8) && pattern.counts[i] > 0) {
            return null;
        }
    }
    return { name: "斷么九", han: 1 };
}

/* ===== 平和（Pinfu）判定相關 ===== */

function isTankiWait(pattern, winTile) {
    const usedInShuntsu = pattern.mentsu.some(m =>
        m.type === "shuntsu" &&
        m.tiles.includes(winTile)
    );

    const usedInKoutsu = pattern.mentsu.some(m =>
        m.type === "koutsu" &&
        m.tile === winTile
    );

    return !usedInShuntsu && !usedInKoutsu;
}

function isEdgeWait(pattern, winTile) {
    return pattern.mentsu.some(m =>
        m.type === "shuntsu" &&
        ((m.tiles[0] === 0 && winTile === 2) || (m.tiles[0] === 6 && winTile === 6))
    );
}

function isClosedWait(pattern, winTile) {
    return pattern.mentsu.some(m =>
        m.type === "shuntsu" &&
        m.tiles[1] === winTile
    );
}

function isRyanmenWait(pattern, winTile) {
    return pattern.mentsu.some(m =>
        m.type === "shuntsu" &&
        (
            m.tiles[0] === winTile ||
            m.tiles[2] === winTile
        )
    );
}

function checkPinfu(pattern, ctx) {
    if (pattern.type !== "standard") return null;

    // 全順子
    if (pattern.mentsu.some(m => m.type !== "shuntsu")) return null;

    const winTile = ctx.winTile;

    if (isTankiWait(pattern, winTile)) return null;
    if (isEdgeWait(pattern, winTile)) return null;
    if (isClosedWait(pattern, winTile)) return null;
    if (!isRyanmenWait(pattern, winTile)) return null;

    return { name: "平和", han: 1 };
}

function countIdenticalShuntsu(pattern) {
    const map = {};
    for (const m of pattern.mentsu) {
        if (m.type === "shuntsu") {
            const k = m.tiles.join("-");
            map[k] = (map[k] || 0) + 1;
        }
    }
    return Object.values(map).filter(v => v >= 2).length;
}

function checkIipeikou(pattern) {
    if (pattern.type !== "standard") return null;
    return countIdenticalShuntsu(pattern) === 1
        ? { name: "一盃口", han: 1 }
        : null;
}

function checkHaitei(_, ctx) {
    return ctx.haitei ? { name: "海底撈月", han: 1 } : null;
}

function checkHoutei(_, ctx) {
    return ctx.houtei ? { name: "河底撈魚", han: 1 } : null;
}

function checkRinshan(_, ctx) {
    return ctx.rinshan ? { name: "嶺上開花", han: 1 } : null;
}

function checkTsubame(_, ctx) {
    return ctx.tsubame ? { name: "燕返", han: 1 } : null;
}

function checkKanburi(_, ctx) {
    return ctx.kanburi ? { name: "槓振", han: 1 } : null;
}

function checkDoubleRiichi(_, ctx) {
    return ctx.doubleRiichi ? { name: "兩立直", han: 2 } : null;
}

function checkToitoi(pattern) {
    if (pattern.type !== "standard") return null;
    return pattern.mentsu.every(m => m.type !== "shuntsu")
        ? { name: "對對和", han: 2 }
        : null;
}

function checkIttsuu(pattern) {
    if (pattern.type !== "standard") return null;

    const seqs = pattern.mentsu
        .filter(m => m.type === "shuntsu")
        .map(m => m.tiles[0]);

    const ok =
        seqs.includes(0) &&
        seqs.includes(3) &&
        seqs.includes(6);

    return ok ? { name: "一氣通貫", han: 2 } : null;
}

function checkSanankou(pattern) {
    const k = pattern.mentsu.filter(m => m.type === "koutsu").length;
    return k === 3 ? { name: "三暗刻", han: 2 } : null;
}

function checkSankantsu(pattern) {
    const k = pattern.mentsu.filter(m => m.type === "ankan").length;
    return k === 3 ? { name: "三槓子", han: 2 } : null;
}

function checkChiitoitsu(pattern) {
    return pattern.type === "sevenPairs"
        ? { name: "七對子", han: 2 }
        : null;
}

function checkRyanpeikou(pattern) {
    if (pattern.type !== "standard") return null;
    return countIdenticalShuntsu(pattern) === 2
        ? { name: "二盃口", han: 3 }
        : null;
}

function checkJunchan(pattern) {
    if (pattern.type !== "standard") return null;
    if (pattern.pair !== 0 && pattern.pair !== 8) return null;
    
    for (const m of pattern.mentsu) {
        if (m.type === "shuntsu") {
            const [a, , c] = m.tiles;
            if (a !== 0 && c !== 8) return null;
        } else {
            if (m.tile !== 0 && m.tile !== 8) return null;
        }
    }
    
    return { name: "純全帶么九", han: 3 };
}

// 只使用索子，必定成立清一色
function checkChinitsu(pattern) {
    return { name: "清一色", han: 6 };
}

const NORMAL_YAKU_GROUPS = [
    // 立直系
    [checkDoubleRiichi, checkRiichi],

    // 盃口系
    [checkRyanpeikou, checkIipeikou],

    // 結構役
    [checkPinfu],
    [checkTanyao],

    // 高飜
    [checkChinitsu]
];

const EXTRA_YAKUS = [
    checkIppatsu,
    checkMenzenTsumo,
    checkHaitei,
    checkHoutei,
    checkRinshan,
    checkTsubame,
    checkKanburi,
    checkToitoi,
    checkIttsuu,
    checkSanankou,
    checkSankantsu,
    checkChiitoitsu,
    checkJunchan
];

/**
 * 選擇最佳解
 */

export function selectBestPattern(patterns, ctx) {
    let best = null;

    for (const pattern of patterns) {
        const evalResult = evaluatePattern(pattern, ctx);

        if (!best || isBetter(evalResult, best)) {
            best = evalResult;
        }
    }

    return best;
}

function evaluatePattern(pattern, ctx) {
    // 先檢查役滿
    const yakuman = checkYakuman(pattern, ctx);
    if (yakuman) {
        return {
            pattern,
            isYakuman: true,
            yakumanRank: yakuman.yakumanRank,
            isKazoeYakuman: false,
            han: 0,
            yakus: yakuman.yakus
        };
    }

    // 普通役
    const normal = checkNormalYakus(pattern, ctx);

    return {
        pattern,
        isYakuman: false,
        yakumanRank: 0,
        isKazoeYakuman: normal.isKazoeYakuman,
        han: normal.han,
        yakus: normal.yakus.map(y => y.name)
    };
}

function isBetter(a, b) {
    if (a.isYakuman !== b.isYakuman) {
        return a.isYakuman;
    }

    if (a.isYakuman) {
        return a.yakumanRank > b.yakumanRank;
    }

    if (a.isKazoeYakuman !== b.isKazoeYakuman) {
        return a.isKazoeYakuman;
    }

    if (a.han !== b.han) {
        return a.han > b.han;
    }

    return a.yakus.length > b.yakus.length;
}

export function calculateFu(pattern, ctx) {
    // === 特例直接回傳 ===

    // 七對子
    if (pattern.type === "sevenPairs") {
        return 25;
    }

    // 平和自摸
    if (ctx.winType === "tsumo" && isPinfuPattern(pattern, ctx)) {
        return 20;
    }

    let fu = 20; // 符底

    // === 門清榮和 ===
    if (ctx.winType === "ron") {
        fu += 10;
    }

    // === 面子符 ===
    for (const m of pattern.mentsu) {
        if (m.type === "koutsu") {
            fu += isYaochu(m.tile) ? 8 : 4;
        }
        if (m.type === "ankan") {
            fu += isYaochu(m.tile) ? 32 : 16;
        }
    }

    // === 聽牌符 ===
    fu += calculateWaitFu(pattern, ctx.winTile);

    // === 自摸符 ===
    if (ctx.winType === "tsumo") {
        fu += 2;
    }

    return roundUpFu(fu);
}

function calculateWaitFu(pattern, winTile) {
    if (isTankiWait(pattern, winTile)) return 2;
    if (isEdgeWait(pattern, winTile)) return 2;
    if (isClosedWait(pattern, winTile)) return 2;
    return 0; // 兩面 或是 雙碰
}

function isPinfuPattern(pattern, ctx) {
    return !!checkPinfu(pattern, ctx);
}

function isYaochu(tile) {
    return tile === 0 || tile === 8;
}

function roundUpFu(fu) {
    return Math.ceil(fu / 10) * 10;
}

const fu = calculateFu(best.pattern, ctx);

const scoreInput = {
    han: best.han,
    fu,
    yakus: best.yakus,
    yakumanRank: best.yakumanRank,
    isKazoeYakuman: best.isKazoeYakuman,
    isParent: ctx.isParent
};
