/**
 * js/ai/discardAI.js
 * 決策：切哪張牌
 */

import { evaluateHandStructure } from './evaluateHand.js';

export function getBestDiscard(hand) {
    let bestTileIndex = -1;
    let maxScore = -Infinity;

    // 遍歷每一張手牌，試著切掉它
    for (let i = 0; i < hand.length; i++) {
        // 1. 複製並移除第 i 張
        const tempHand = [...hand];
        tempHand.splice(i, 1);
        
        // 2. 算分
        const score = evaluateHandStructure(tempHand);

        // 3. 微調：如果分數一樣，優先切邊張(1,9)，保留中張(3-7)
        // 這樣 AI 比較不會隨便把好牌切掉
        const tile = hand[i];
        
        // 中張權重 (0.1 ~ 0.5 分的微小差距)
        // 4,5,6 最重要，2,3,7,8 次之，1,9 最不重要
        const centrality = (tile === 0 || tile === 8) ? 0 :
                           (tile === 1 || tile === 7) ? 0.1 :
                           (tile === 2 || tile === 6) ? 0.2 : 0.3;

        // 我們希望切掉「造成剩餘手牌分數最高」的那張
        // 但如果剩餘分數一樣，我們希望切掉「重要性最低」的那張
        // 也就是：總分 = 結構分 - 這張牌的重要性
        // (切掉爛牌，保留好牌)
        
        const finalScore = score - centrality; 

        if (finalScore > maxScore) {
            maxScore = finalScore;
            bestTileIndex = i;
        }
    }

    return { index: bestTileIndex, score: maxScore };
}
