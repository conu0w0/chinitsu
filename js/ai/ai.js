/**
 * js/ai/ai.js
 * AI 決策入口
 */

import { checkRiichi } from './riichiAI.js';
import { getBestDiscard } from './discardAI.js';

export function decideComAction(gameState, playerIndex) {
    const player = gameState.players[playerIndex];
    const logic = gameState.logic;

    // === 1. 反應階段 (榮和判定) ===
    if (gameState.phase === "REACTION_DECISION") {
        const legalActions = gameState.getLegalActions(playerIndex);
        if (legalActions.canRon) {
            return { type: 'RON' };
        }
        return { type: 'CANCEL' };
    }

    // === 2. ★ 修正重點：立直宣言階段 ===
    // 如果現在已經是「正在立直宣言中」，AI 只需要回傳切哪張牌就好
    // 不需要再去檢查自摸、暗槓或再次檢查立直
    if (gameState.phase === "RIICHI_DECLARATION") {
        const bestDiscard = getBestDiscard(player.tepai);
        return {
            type: 'DISCARD',
            tileIndex: bestDiscard.index
        };
    }

    // === 3. 正常出牌階段 ===

    // A. 檢查【自摸】
    const currentAnkanCount = player.fulu.filter(f => f.type === 'ankan').length;
    if (logic.isWinningHand(player.tepai, currentAnkanCount)) {
        return { type: 'TSUMO' };
    }

    // B. 檢查【暗槓】    
    const waitSet = player.isReach ? player.riichiWaitSet : null;
    const ankanTiles = logic.getAnkanTiles(player.tepai, currentAnkanCount, waitSet);

    if (ankanTiles.length > 0) {
        return { 
            type: 'ANKAN', 
            tile: ankanTiles[0] 
        };
    }

    // C. 檢查【立直後狀態】(強制摸切)
    // 這是指「已經立直成功」之後的回合
    if (player.isReach) {
        return {
            type: 'DISCARD',
            tileIndex: player.tepai.length - 1
        };
    }

    // D. 檢查【是否要立直】
    // 這是指「還沒立直」時的判斷
    if (checkRiichi(player, gameState)) {
        return { type: 'RIICHI' };
    }

    // E. 普通狀態：計算最佳切牌
    const bestDiscard = getBestDiscard(player.tepai);

    return {
        type: 'DISCARD',
        tileIndex: bestDiscard.index
    };
}
