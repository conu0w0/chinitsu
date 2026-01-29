/**
 * js/ai/riichiAI.js
 * 決策：要不要立直
 */

import { getBestDiscard } from './discardAI.js';

// ★ 重點就是這個 export，一定要有！
export function checkRiichi(player, gameState) {
    // 1. 規則檢查：已立直、非門清 (有副露) 則不能立直
    if (player.isReach) return false;
    if (player.fulu.length > 0) return false;

    // 2. 檢查是否聽牌 (Tenpai)
    // 邏輯：如果切掉「最佳切牌」之後，聽牌數 > 0，那就是聽牌了
    const bestDiscard = getBestDiscard(player.tepai);
    
    // 模擬切牌
    const tempHand = [...player.tepai];
    tempHand.splice(bestDiscard.index, 1);
    
    // 使用遊戲核心邏輯檢查聽牌
    const waits = gameState.logic.getWaitTiles(tempHand);
    
    if (waits.size > 0) {
        // 3. 個性參數：85% 機率立直
        const randomFactor = Math.random();

        // 簡單策略：大膽進攻
        if (randomFactor < 0.85) {
            return true;
        }
    }

    return false;
}
