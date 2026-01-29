/**
 * js/ai/ai.js
 * AI 決策入口 (升級版：支援立直暗槓)
 */

import { checkRiichi } from './riichiAI.js';
import { getBestDiscard } from './discardAI.js';

export function decideComAction(gameState, playerIndex) {
    const player = gameState.players[playerIndex];
    const logic = gameState.logic;

    if (gameState.phase === "REACTION_DECISION") {
        const legalActions = gameState.getLegalActions(playerIndex);

        // 1. 如果能榮和，絕不放過！
        if (legalActions.canRon) {
            return { type: 'RON' };
        }

        // 2. 如果不能榮和，就跳過 (CANCEL)
        return { type: 'CANCEL' };
    }


    // 1. 檢查【自摸】
    const currentAnkanCount = player.fulu.filter(f => f.type === 'ankan').length;
    if (logic.isWinningHand(player.tepai, currentAnkanCount)) {
        return { type: 'TSUMO' };
    }

    // === 2. 檢查【暗槓】 ===    
    const waitSet = player.isReach ? player.riichiWaitSet : null;
    const ankanTiles = logic.getAnkanTiles(player.tepai, currentAnkanCount, waitSet);

    if (ankanTiles.length > 0) {
        // AI 簡單邏輯：有槓就槓 (選第一種可能的槓材)
        // 這裡直接發送 "ANKAN" 指令，配合剛剛在 GameState 開的後門
        return { 
            type: 'ANKAN', 
            tile: ankanTiles[0] 
        };
    }

    // 3. 檢查【立直狀態】
    if (player.isReach) {
        // 沒自摸也沒暗槓，立直狀態下強制摸切
        return {
            type: 'DISCARD',
            tileIndex: player.tepai.length - 1
        };
    }

    // 4. 檢查【立直宣言】
    if (checkRiichi(player, gameState)) {
        return { type: 'RIICHI' };
    }

    // 5. 普通狀態：計算最佳切牌
    const bestDiscard = getBestDiscard(player.tepai);

    return {
        type: 'DISCARD',
        tileIndex: bestDiscard.index
    };
}
