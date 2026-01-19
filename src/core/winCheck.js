import { YAKU } from './constants.js'; 
import { getAgariPatterns } from './patternLogic.js';
import { calculateFu, getWaitType } from './fuLogic.js';

/**
 * 主入口：計算和了結果
 * 自動處理天和的「任意牌視為自摸」規則
 * @param {Array<number>} handTiles - 手牌 (不含和了牌)
 * @param {number} winTile - 和了牌
 * @param {Object} ctx - 上下文 (isTenhou, isRiichi, isTsumo...)
 */
export function calculateResult(handTiles, winTile, ctx = {}) {
    // 1. 如果是天和 (Tenhou)
    // 規則：14張牌中的任意一張都可視為自摸牌，取最高分
    if (ctx.isTenhou) {
        // 合併所有牌 (共14張)
        const allTiles = [...handTiles, winTile].sort((a, b) => a - b);
        // 找出所有獨一無二的牌 (嘗試每一張當作 winTile)
        const uniqueTiles = [...new Set(allTiles)];
        
        let bestResult = null;

        for (const tileCandidate of uniqueTiles) {
            // 模擬將這張牌從手牌移出，當作 winTile
            const tempHand = [...allTiles];
            const idx = tempHand.indexOf(tileCandidate);
            tempHand.splice(idx, 1); // 移除一張

            // 進行計算 (強制視為自摸 isTsumo: true)
            // 注意：我們保留 isTenhou 標記，以便內部計算役滿時知道這是天和
            const res = coreCalculate(tempHand, tileCandidate, { ...ctx, isTsumo: true });
            
            // 更新最佳結果
            if (isBetterResult(res, bestResult)) {
                bestResult = res;
            }
        }
        return bestResult;
    }

    // 2. 地和/人和/一般情況：winTile 固定
    // 地和與人和雖然也是首巡和牌，但不適用「任意換牌」規則
    return coreCalculate(handTiles, winTile, ctx);
}

/**
 * 比較兩個結果誰分數高
 * @returns {boolean} true if newRes is better
 */
function isBetterResult(newRes, oldRes) {
    if (!newRes) return false;
    if (!oldRes) return true;

    // 比較優先級：
    // 1. 是否役滿 (isYakuman)
    if (newRes.isYakuman !== oldRes.isYakuman) return newRes.isYakuman;
    
    // 2. 役滿倍數 (yakumanCount)
    if (newRes.isYakuman) {
        return newRes.yakumanCount > oldRes.yakumanCount;
    }

    // 3. 翻數 (han)
    return newRes.han > oldRes.han;
}

/**
 * 核心計算邏輯 (單次判定)
 */
function coreCalculate(handTiles, winTile, ctx) {
    const tiles = [...handTiles, winTile].sort((a, b) => a - b);
    const counts = countTiles(tiles);
    
    // A. 全牌型役滿 (傳入 winTile 以供純正九蓮判斷)
    const baseYakuman = checkYakumanByTiles(tiles, counts, winTile, ctx);

    // B. 七對子 (特殊拆解)
    if (isChiitoitsu(counts)) {
        // 如果七對子成立，也必須檢查是否構成天和/地和/人和等 flag 役滿
        let yakumanList = [...baseYakuman];
        if (ctx.isTenhou) pushUnique(yakumanList, YAKU.TENHOU);
        if (ctx.isChihou) pushUnique(yakumanList, YAKU.CHIHOU);
        if (ctx.isRenhou) pushUnique(yakumanList, YAKU.RENHOU);

        let yaku = [YAKU.CHINITSU, YAKU.CHIITOI];
        if (isTanyao(tiles)) yaku.push(YAKU.TANYAO);

        // 七對子不需要進行後續的面子拆解
        return finalize({
            yakuman: yakumanList,
            yaku: yaku,
            han: yaku.reduce((s, y) => s + y.han, 0)
        });
    }

    // C. 一般拆解
    const patterns = getAgariPatterns(tiles, ctx.ankanTiles || []);
    if (!patterns.length) return null; // 詐和或無役

    let best = null;

    for (const p of patterns) {
        const r = calcFromPattern(p, tiles, winTile, ctx);
        
        // 合併 A 類 (牌型役滿) 與 C 類 (拆解役滿)
        let currentYakumanList = [...baseYakuman, ...r.yakuman];
        
        // 加入 天地人和 (只需加一次)
        if (ctx.isTenhou) pushUnique(currentYakumanList, YAKU.TENHOU);
        if (ctx.isChihou) pushUnique(currentYakumanList, YAKU.CHIHOU);
        if (ctx.isRenhou) pushUnique(currentYakumanList, YAKU.RENHOU);

        // 計算總役滿倍數 (假設 YAKU 物件裡有定義 value 倍率，預設為 1)
        const totalYakumanCount = currentYakumanList.reduce((s, y) => s + (y.value || 1), 0);
        
        if (!best) {
            best = { ...r, yakuman: currentYakumanList, totalYakuman: totalYakumanCount };
        } else {
            // 比較邏輯：役滿數 > 翻數
            if (totalYakumanCount > best.totalYakuman) {
                best = { ...r, yakuman: currentYakumanList, totalYakuman: totalYakumanCount };
            } else if (totalYakumanCount === best.totalYakuman && r.han > best.han) {
                best = { ...r, yakuman: currentYakumanList, totalYakuman: totalYakumanCount };
            }
        }
    }

    return finalize(best);
}

/**
 * 根據拆解後的 Pattern 計算役種與翻數
 */
function calcFromPattern(p, tiles, winTile, ctx) {
    let yakuman = [];
    let yaku = [YAKU.CHINITSU]; // 6飜 (必定)

    const runs = p.mentsu.filter(m => m.type === 'run');
    const trips = p.mentsu.filter(m => m.type === 'triplet'); // 包含暗刻與槓

    // 取得聽牌型 (ryanmen, kanchan, penchan, shanpon, tanki)
    const wait = getWaitType(p, winTile);

    // ---------- 刻子類計算 (Sanankou / Toitoi / Suuankou) ----------
    let ankouCount = 0;
    let kanCount = 0;

    trips.forEach(t => {
        if (t.isKan) kanCount++; 
        
        // 判斷暗刻
        // 1. 如果是暗槓 (t.ankan)，必定是暗刻
        // 2. 如果是自摸，所有刻子都是暗刻
        // 3. 如果是榮和，且這組刻子包含和了牌，則算明刻(雙碰榮和)，除此之外是暗刻
        const isWinTileMentsu = t.tiles.includes(winTile);
        
        if (t.ankan) {
            ankouCount++;
        } else if (ctx.isTsumo) {
            ankouCount++;
        } else {
            // 榮和：如果這組不是被榮和的那組，就是暗刻
            if (!isWinTileMentsu) {
                ankouCount++;
            }
        }
    });

    // 四暗刻 / 四暗刻單騎
    // 這裡邏輯要小心：如果是雙碰榮和，ankouCount 只會是 3，進不了這裡。
    // 如果是單騎榮和，ankouCount 會是 4 (因為榮和的是雀頭)，進入這裡。
    if (ankouCount === 4) {
        if (wait === 'tanki') {
            yakuman.push(YAKU.SUUANKOU_TANKI); // 雙倍
        } else {
            yakuman.push(YAKU.SUUANKOU);
        }
    }

    // 四槓子
    if (kanCount === 4) {
        yakuman.push(YAKU.SUUKANTSU);
    }

    // 金門橋 (123, 345, 567, 789)
    // 假設 r.start 存順子第一張
    const starts = runs.map(r => r.start); 
    if (starts.includes(1) && starts.includes(3) && starts.includes(5) && starts.includes(7)) {
        yakuman.push(YAKU.GOLDEN_GATE);
    }

    // ===== 一般役判定 =====
    
    // 1飜
    if (ctx.isRiichi) yaku.push(YAKU.RIICHI);
    if (ctx.isTsumo) yaku.push(YAKU.TSUMO); // 門清自摸
    if (ctx.isIppatsu) yaku.push(YAKU.IPPATSU);
    if (isTanyao(tiles)) yaku.push(YAKU.TANYAO);
    if (ctx.isRinshan) yaku.push(YAKU.RINSHAN);
    if (ctx.isChankan) yaku.push(YAKU.CHANKAN);
    if (ctx.isHaitei) yaku.push(YAKU.HAITEI);
    if (ctx.isHoutei) yaku.push(YAKU.HOUTEI);
    if (ctx.isTsubame) yaku.push(YAKU.TSUBAME);
    if (ctx.isKanburi) yaku.push(YAKU.KANBURI);

    // 平和 (無刻子/槓 + 兩面聽)
    // 暗槓會破壞平和 (因為有符)，所以 trips.length 必須為 0
    if (trips.length === 0 && wait === 'ryanmen') {
        yaku.push(YAKU.PINFU);
    }

    // 一盃口 / 二盃口
    const peiko = countPeiko(runs);
    if (peiko === 1) yaku.push(YAKU.IIPEIKO);
    if (peiko === 2) yaku.push(YAKU.RYANPEIKO); // 3飜

    // 2飜
    if (ctx.isDoubleRiichi) yaku.push(YAKU.DOUBLE_RIICHI);
    
    // 對對和 (4個刻子)
    if (trips.length === 4) yaku.push(YAKU.TOITOI);
    
    // 三暗刻
    if (ankouCount === 3) yaku.push(YAKU.SANANKOU);
    
    // 三槓子
    if (kanCount === 3) yaku.push(YAKU.SANKANTSU);

    // 一氣通貫
    if (starts.includes(1) && starts.includes(4) && starts.includes(7)) {
        yaku.push(YAKU.ITTSU);
    }

    // 3飜 純全帶么九
    if (isJunchan(p)) yaku.push(YAKU.JUNCHAN);

    const han = yaku.reduce((s, y) => s + y.han, 0);

    return { yakuman, yaku, han };
}

/**
 * 檢查不需要面子拆解的牌型役滿 (九蓮、綠一色、大竹林)
 */
function checkYakumanByTiles(tiles, c, winTile, ctx) {
    let res = [];

    // 綠一色 (2,3,4,6,8s)
    if (tiles.every(t => [2, 3, 4, 6, 8].includes(t))) {
        res.push(YAKU.RYUUIISOU);
    }

    // 大竹林 (2~8 的七對子)
    // 檢查是否所有牌都在 2~8 之間 且 每種數量都是 2
    const isAllSimple = tiles.every(t => t >= 2 && t <= 8);
    // 檢查是否為七對子形狀 (每種牌各2張)
    const isSevenPairs = Object.values(c).every(cnt => cnt === 2) && Object.keys(c).length === 7;
    
    if (isAllSimple && isSevenPairs) {
        res.push(YAKU.DAI_CHIKURIN);
    }

    // 九蓮寶燈
    // 基本條件：111 2345678 999 + 任意一張
    // 為了判斷純正，我們需要移除和了牌
    if (c[1] >= 3 && c[9] >= 3 && [2,3,4,5,6,7,8].every(n => c[n] >= 1)) {
        
        // 模擬移除一張和了牌後的狀態 (聽牌型)
        const countsMinusWin = { ...c };
        countsMinusWin[winTile]--;

        // 檢查剩餘的 13 張是否剛好構成純正九蓮的形狀
        const isPureShape = 
            countsMinusWin[1] === 3 && 
            countsMinusWin[9] === 3 && 
            [2,3,4,5,6,7,8].every(n => countsMinusWin[n] === 1);

        if (isPureShape) {
            res.push(YAKU.CHUUREN_PURE); // 雙倍役滿
        } else {
            res.push(YAKU.CHUUREN);
        }
    }

    return res;
}

// ==========================================================
// 輔助函數區 (Helpers)
// ==========================================================

function finalize(result) {
    if (!result) return null;
    
    // 如果有役滿，將 isYakuman 設為 true，並計算總倍數
    if (result.yakuman && result.yakuman.length > 0) {
        const yakumanCount = result.totalYakuman || result.yakuman.length;
        return {
            isYakuman: true,
            yaku: result.yakuman, // 顯示役滿名稱
            han: 0, // 役滿不看翻數
            yakumanCount: yakumanCount,
            scoreName: (yakumanCount > 1) ? '雙倍役滿' : '役滿' 
        };
    }
    
    // 累計役滿檢查 (13飜以上)
    if (result.han >= 13) {
        return {
            isYakuman: true,
            yaku: result.yaku,
            han: result.han,
            yakumanCount: 1,
            scoreName: '累計役滿'
        };
    }

    return {
        isYakuman: false,
        yaku: result.yaku,
        han: result.han,
        scoreName: getScoreName(result.han)
    };
}

function getScoreName(han) {
    if (han >= 11) return '三倍滿';
    if (han >= 8) return '倍滿';
    if (han >= 6) return '跳滿';
    if (han >= 5) return '滿貫';
    return han + '飜';
}

function countTiles(arr) {
    const c = {};
    for (const x of arr) c[x] = (c[x] || 0) + 1;
    return c;
}

function pushUnique(list, item) {
    if (!list.find(y => y.name === item.name)) {
        list.push(item);
    }
}

// 七對子判斷：7種牌，每種2張
function isChiitoitsu(counts) {
    const keys = Object.keys(counts);
    if (keys.length !== 7) return false;
    return keys.every(k => counts[k] === 2);
}

// 斷么九：沒有1或9
function isTanyao(tiles) {
    return tiles.every(t => t > 1 && t < 9);
}

// 純全帶么九：所有面子和雀頭都包含1或9 (清一色環境下，不用管字牌)
function isJunchan(pattern) {
    // 檢查雀頭
    if (pattern.head !== 1 && pattern.head !== 9) return false;
    
    // 檢查每個面子
    for (const m of pattern.mentsu) {
        // m.tiles 包含了該面子的所有牌
        const hasYaochu = m.tiles.some(t => t === 1 || t === 9);
        if (!hasYaochu) return false;
    }
    return true;
}

// 計算盃口 (Identical Runs)
function countPeiko(runs) {
    if (runs.length < 2) return 0;
    
    // 建立字串標識以便比較，例如 "run-1" 代表 1-2-3
    const runSignatures = runs.map(r => r.start);
    const counts = {};
    runSignatures.forEach(s => counts[s] = (counts[s] || 0) + 1);
    
    let pairs = 0;
    for (const s in counts) {
        if (counts[s] >= 2) pairs++;
        if (counts[s] >= 4) pairs++; // 4個一樣的順子 = 兩盃口
    }
    return pairs;
}
