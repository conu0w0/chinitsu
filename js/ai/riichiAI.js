/**
 * js/ai/riichiAI.js
 * 決策：要不要立直
 */

import { getBestDiscard } from './discardAI.js';

export function checkRiichi(player, gameState) {
    if (player.isReach) return false;
    if (player.fulu.length > 0) return false;

    const bestDiscard = getBestDiscard(gameState, player.id);

    const tempHand = [...player.tepai];
    tempHand.splice(bestDiscard.tileIndex, 1);

    const waits = gameState.logic.getWaitTiles(tempHand);

    if (waits.size > 0) {
        return Math.random() < 0.85;
    }
    return false;
}

