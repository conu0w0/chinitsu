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

    // === 2. 立直宣言階段：只要決定切哪張 ===
    if (gameState.phase === "RIICHI_DECLARATION") {
        const bestDiscard = getBestDiscard(gameState, playerIndex);
        return {
            type: 'DISCARD',
            tileIndex: bestDiscard.tileIndex
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
    if (player.isReach) {
        return {
            type: 'DISCARD',
            tileIndex: player.tepai.length - 1
        };
    }

    // D. 檢查【是否要立直】
    if (checkRiichi(player, gameState)) {
        return { type: 'RIICHI' };
    }

    // E. 普通狀態：計算最佳切牌（進攻/防守整合版）
    const bestDiscard = getBestDiscard(gameState, playerIndex);
    return {
        type: 'DISCARD',
        tileIndex: bestDiscard.tileIndex
    };
}
