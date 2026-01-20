import { TILES } from "./constants.js"; // 假設你需要常數，如果沒有可以拿掉

/**
 * 計算符數 (Fu)
 * @param {Array} hand - 手牌陣列
 * @param {number} winTile - 和了的那張牌
 * @param {Object} ctx - 上下文 { isTsumo, isRiichi, roundWind, seatWind, ... }
 * @param {Object} decomposition - 手牌拆解結果 { head: [], sets: [[1,2,3], [5,5,5]...] }
 * @returns {number} 符數 (例如 30, 40, 25)
 */
export function calculateFu(hand, winTile, ctx, decomposition) {
    // 1. 底符 (Base Fu)
    let fu = 20;

    // 七對子特殊規則：固定 25 符
    if (decomposition.isChiitoitsu) {
        return 25;
    }

    // 2. 門前加符 (Menzen-kafru) / 自摸 (Tsumo)
    // 如果是門前清榮和 (Ron)，加 10 符
    // 如果是自摸 (Tsumo)，加 2 符 (除了平和自摸例外，但在這裡先加，最後調整)
    const isMenzen = ctx.melds ? ctx.melds.length === 0 : true; // 假設 ctx 裡有 melds 資訊，或從 decomposition 判斷

    if (ctx.isTsumo) {
        fu += 2;
    } else if (isMenzen) {
        fu += 10;
    }

    // 3. 組合符 (Sets Fu) - 刻子/槓子
    // 這裡需要判斷每一組是 順子(0符) 還是 刻子(有符)
    // 另外要區分 明刻/暗刻 (如果是榮和，明刻算明，暗刻算暗；如果是自摸，全部算暗？不，榮和的那張刻子算明刻)
    
    // 簡單實作：遍歷 decomposition.sets
    // 為了簡化，我們假設 decomposition 裡的 sets 已經標記了 type ('shuntsu', 'koutsu', 'kantsu')
    // 或者是純數字陣列，我們自己判斷
    
    // *注意*：因為這是「清一色」簡化版，我們假設外部傳進來的 decomposition 結構如下：
    // { head: [1,1], sets: [ [1,2,3], [5,5,5] ... ], winGroupIndex: 1 }
    
    // 如果沒有 winGroupIndex，我們需要猜測哪一組包含 winTile
    
    if (decomposition.sets) {
        decomposition.sets.forEach((set, index) => {
            if (isShuntsu(set)) return; // 順子 0 符

            let score = 2; // 中張明刻
            const isYaochu = isTerminalOrHonor(set[0]);
            
            // 基礎分：中張2, 么九4
            if (isYaochu) score *= 2;

            // 暗刻/明刻 判定
            // 邏輯：如果是手牌裡的純刻子 -> 暗刻 (x2)
            // 如果是碰/槓 -> 明刻 (x1)
            // 如果是榮和的那張牌構成的刻子 -> 視為明刻
            
            // 這裡簡化：假設沒有副露(因清一色練習多為門清)，除了榮和的那組算明刻，其他算暗刻
            const isWinSet = containsWinTile(set, winTile) && !ctx.isTsumo;
            
            if (!isWinSet) { 
                score *= 2; // 暗刻
            }

            // 如果是槓 (Kantsu)，再 x4
            // (需要 decomposition 標記這是槓，這裡暫略)

            fu += score;
        });
    }

    // 4. 雀頭符 (Head Fu)
    // 役牌當頭加 2 符 (三元牌、場風、自風)
    if (decomposition.head) {
        const tile = decomposition.head[0];
        // 假設 1-9 索子沒有字牌，所以沒有三元牌
        // 只有場風自風判定 (但在純數字麻將通常不計風牌符，除非有定義 1索是對應什麼)
        // 在這個清一色小遊戲中，通常忽略雀頭符，除非有特定設定
    }

    // 5. 聽牌符 (Wait Fu) - 嵌張、邊張、單騎 +2符
    const waitType = getWaitType(decomposition, winTile);
    if (['kanchan', 'penchan', 'tanki'].includes(waitType)) {
        fu += 2;
    }

    // 6. 符數進位 (切上)
    // 如果是 20 符且非門前榮和(例如有吃碰)，則不可能是20，至少30?
    // 這裡做標準切上：個位數無條件進位到 10
    if (fu === 20 && !ctx.isTsumo) {
        // 特例：平和榮和是 30 符 (副底20+門前10) -> 已由前面邏輯處理
        // 但如果是有副露的平和型榮和... (喰断) -> 30符
        // 為了保險，所有結果進位
        fu = Math.ceil(fu / 10) * 10;
        if (fu === 20) fu = 30; // 門清榮和最少 30 (平和型) ? 不，平和自摸20，平和榮和30
    } else {
        fu = Math.ceil(fu / 10) * 10;
    }

    return fu;
}

/**
 * 判斷聽牌型式 (導出此函式以解決 Error)
 * @param {Object} decomposition 
 * @param {number} winTile 
 * @returns {string} 'ryanmen' | 'penchan' | 'kanchan' | 'shanpon' | 'tanki'
 */
export function getWaitType(decomposition, winTile) {
    // 1. 如果雀頭包含 winTile 且雀頭是剛好兩張 -> 單騎
    // 注意：要判斷 winTile 是用在雀頭還是面子裡
    // 這裡需要 decomposition 告訴我們 winTile 屬於哪一組
    // 假設 decomposition 結構有標記，或者我們根據組合推導
    
    // 簡單判斷策略：
    // 如果拆解結果是 七對子 -> 單騎
    if (decomposition.isChiitoitsu) return 'tanki';

    // 找出包含 winTile 的那一組 (Set or Head)
    // 這裡有個歧義：如果是 2333 和 3 (既可以是 23+33(頭) 兩面，也可以是 233+3(頭) 單騎)
    // 通常 calculateResult 會回傳「最高分」的拆解。
    // 我們這裡假設 decomposition 已經是確定的一組
    
    // 假設 decomposition.winGroup 存在，是 ['head'] 或 ['sets', index]
    // 若不存在，我們簡單比對：
    
    // 檢查頭
    if (decomposition.head.includes(winTile)) {
        // 如果贏的是頭，那就是單騎
        // (除非這張牌同時也可以解釋成順子的一部分，這由拆解邏輯決定)
        // 這裡假設如果被歸類在 head，就是單騎
        // 但要注意如果手牌是 11 123，和 1，可以是 (11)+123 -> 單騎
        // 也可以是 (123)+11 -> 雙碰? 不，雙碰是聽對對
        // 我們這裡假定 decomposition 的 sets 是完成的面子
        // 如果 winTile 在 head 裡，表示這張牌完成了 head -> 單騎
        return 'tanki'; 
    }

    // 檢查面子
    if (decomposition.sets) {
        for (let set of decomposition.sets) {
            if (set.includes(winTile)) {
                // 是刻子 -> 雙碰 (Shanpon)
                // 聽牌時是兩個對子，和牌時變成刻子
                if (isKoutsu(set)) {
                    return 'shanpon';
                }

                // 是順子 -> 判斷 兩面/嵌張/邊張
                if (isShuntsu(set)) {
                    const sorted = [...set].sort((a, b) => a - b);
                    const idx = sorted.indexOf(winTile);

                    // 嵌張 (Kanchan): 聽中間，例如 1-3 聽 2
                    if (idx === 1) return 'kanchan';

                    // 邊張 (Penchan): 1-2 聽 3 或 8-9 聽 7
                    if (sorted[0] === 1 && sorted[1] === 2 && winTile === 3) return 'penchan'; // 實際上這是不可能的，和了之後是123，winTile是3 -> idx是2
                    if (sorted[0] === 7 && sorted[1] === 8 && winTile === 7) return 'penchan'; // idx是0

                    // 修正邏輯：
                    // 和了形是 [1,2,3]，winTile 是 3 -> 聽牌時是 [1,2]，這是邊張
                    // 和了形是 [1,2,3]，winTile 是 1 -> 聽牌時是 [2,3]，這是兩面 (聽1/4)，但在123這組來看...
                    // 邊張定義：聽 3 且用 12 搭子 (123中3是邊張)，或者 聽 7 且用 89 搭子
                    
                    if (idx === 2 && sorted[0] === 1 && sorted[1] === 2) return 'penchan'; // 123 和 3
                    if (idx === 0 && sorted[1] === 8 && sorted[2] === 9) return 'penchan'; // 789 和 7

                    // 其他都是兩面 (Ryanmen)
                    return 'ryanmen';
                }
            }
        }
    }

    return 'ryanmen'; // fallback
}

// --- 輔助函式 ---

function isShuntsu(tiles) {
    return tiles[0] !== tiles[1]; // 簡單判斷：不是對子/刻子就是順子
}

function isKoutsu(tiles) {
    return tiles[0] === tiles[1] && tiles.length >= 3;
}

function isTerminalOrHonor(tile) {
    return tile === 1 || tile === 9; // 只有索子，沒有字牌
}

function containsWinTile(set, tile) {
    // 這是一個寬鬆檢查，只要集合裡有這張牌就算
    // 精確計算需要知道這張牌是不是「剛摸進來的那張」
    // 在符數計算中，通常我們假設 decomposition 已經處理好這層邏輯
    return set.includes(tile);
}
