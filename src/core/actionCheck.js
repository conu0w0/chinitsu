/**
 * actionCheck.js
 * 決定UI該顯示哪些操作按鈕
 */

import { getWaitingTiles } from './winCheck.js';

/**
 * 取得當前可用的操作按鈕
 * @param {Object} player - 玩家物件
 * @param {Array<number>} player.hand - 手牌
 * @param {Array<Object>} player.melds - 副露
 * @param {boolean} player.isRiichi - 是否立直
 * @param {boolean} isMyTurn - 是否輪到自己
 * @param {number|null} incomingTile - 進張的牌 (自摸牌 或 對手舍牌)
 * @param {string} phase - 階段 ('DRAW': 自摸後, 'DISCARD': 對手舍牌後)
 * @returns {Array<string>} - 按鈕列表 ['KAN', 'RIICHI', 'RON', 'TSUMO', 'CANCEL']
 */
export function getAvailableActions(player, isMyTurn, incomingTile, phase) {
    const buttons = [];

    // === 自己的回合 (自摸後，切牌前) ===
    if (isMyTurn && phase === 'DRAW') {
        const handWithDraw = [...player.hand, incomingTile].sort((a, b) => a - b);

        // 1. [自摸]：規則設定為「必定出現」(即便沒聽牌，按了就是詐和)
        buttons.push('TSUMO');

        // 2. [立直]：還沒立直時，必定出現
        if (!player.isRiichi) {
            buttons.push('RIICHI');
        }

        // 3. [槓] (暗槓)：檢查是否合法
        // 找出所有能槓的牌 (手牌內有4張)
        const canKanList = checkAnkan(player.hand, incomingTile, player.isRiichi, player.melds);
        if (canKanList.length > 0) {
            // 這裡可以回傳具體可以槓哪張，前端UI若有多種槓材需讓玩家選
            // 為了簡化，只要有能槓的就顯示按鈕
            buttons.push('KAN');
        }
    }

    // === 對手的回合 (對手舍牌後) ===
    if (!isMyTurn && phase === 'DISCARD') {
        // 4. [榮和]：規則設定為「必定出現」(即便沒聽牌)
        buttons.push('RON');
        
        // 本遊戲無鳴牌(吃碰)，所以沒有 PON/CHI 按鈕
    }

    // 5. [取消]：只要有任何按鈕出現，就必須有取消 (除了榮和/自摸如果不按通常就是Pass)
    // 但為了 UI 統一，如果有動作可選，就給取消
    if (buttons.length > 0) {
        buttons.push('CANCEL');
    }

    return buttons;
}

/**
 * 檢查暗槓合法性
 * @returns {Array<number>} 回傳可以槓的牌的數字列表
 */
function checkAnkan(hand, drawTile, isRiichi, melds) {
    const allTiles = [...hand, drawTile].sort((a, b) => a - b);
    const counts = {};
    allTiles.forEach(t => counts[t] = (counts[t] || 0) + 1);

    const possibleKans = [];
    for (const tile in counts) {
        if (counts[tile] === 4) {
            const tileNum = parseInt(tile);
            
            // 如果沒立直，隨便槓
            if (!isRiichi) {
                possibleKans.push(tileNum);
            } 
            // 如果立直了，需要特殊檢查
            else {
                if (checkRiichiKanValidity(hand, drawTile, tileNum, melds)) {
                    possibleKans.push(tileNum);
                }
            }
        }
    }
    return possibleKans;
}

/**
 * 立直後暗槓的特殊檢查
 * 規則：
 * 1. 槓的這張牌必須是剛摸到的牌 (通常規則，防止改變手牌結構)
 * 2. 槓了之後，不能改變原本的聽牌 (Machi)
 * 3. (進階) 槓了之後，不能改變原本的面子構成 (這裡簡化為只查聽牌)
 */
function checkRiichiKanValidity(hand, drawTile, kanTile, melds) {
    // 規則1：立直後只能槓「剛摸到的牌」
    // 如果手牌原本就有4張(比如原本就有4張1s沒槓就立直)，那現在也不能槓。
    // 也就是說，這4張裡面必須包含 drawTile
    if (kanTile !== drawTile) return false;

    // 準備比對：
    // A. 槓之前的聽牌 (也就是現在狀態，先把剛摸到的牌拿掉計算)
    // 這裡我們假設 player.hand 是不含 drawTile 的 (根據傳入參數結構調整)
    // hand 是 13 張
    const originalWaits = getWaitingTiles(hand, melds);
    
    // 如果原本沒聽牌 (這在詐和立直時會發生)，那就不允許槓，避免混亂
    if (originalWaits.length === 0) return false;

    // B. 槓之後的聽牌
    // 模擬槓後的狀態：從手牌移除4張 kanTile，加入一組暗槓
    // 注意：getWaitingTiles 預期的是「未摸牌狀態的手牌(13張/10張/7張...)」
    // 槓完之後，會補槓嶺上牌，但在補牌「之前」，手牌結構必須保持聽牌不變
    // 實際上，判斷槓是否合法，是看「槓完後的手牌(少了4張牌)+如果是任意牌」是否聽牌改變
    // 簡化邏輯：我們把那4張牌移除，視為「已完成的槓子(Melds)」，看看剩下的牌聽什麼
    
    const newHand = [...hand, drawTile].filter(t => t !== kanTile); // 移除4張
    const newMelds = [...melds, { type: 'ankan', tiles: [kanTile, kanTile, kanTile, kanTile] }];

    const newWaits = getWaitingTiles(newHand, newMelds);

    // C. 比對 A 和 B 是否完全相同
    if (originalWaits.length !== newWaits.length) return false;
    for (let i = 0; i < originalWaits.length; i++) {
        if (originalWaits[i] !== newWaits[i]) return false;
    }

    return true;
}
