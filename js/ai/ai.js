/**
 * js/ai/ai.js
 * AI 決策入口
 */

import { checkRiichi } from './riichiAI.js';
import { getBestDiscard } from './discardAI.js';

export function decideComAction(gameState, playerIndex) {
    const player = gameState.players[playerIndex];
    const logic = gameState.logic;
    
    // 計算目前的暗槓數 (判斷胡牌需要)
    const currentAnkanCount = player.fulu.filter(f => f.type === 'ankan').length;

    // === 1. 反應階段 (榮和判定) ===
    if (gameState.phase === "REACTION_DECISION") {
        const legalActions = gameState.getLegalActions(playerIndex);
        
        // ★★★ 修正重點 1：AI 必須自己驗算能不能胡 ★★★
        if (legalActions.canRon) {
            const winningTile = gameState.lastDiscard.tile;
            
            // 1. 模擬把這張牌加入手牌
            // 注意：要用 [...陣列] 複製一份，不要改到原本的手牌
            const simulatedHand = [...player.tepai, winningTile];
            
            // 2. 檢查形狀是否成立 (4面子+1雀頭)
            const isShapeValid = logic.isWinningHand(simulatedHand, currentAnkanCount);

            // 3. 檢查是否振聽 (AI 必須避免振聽榮和)
            // 取得目前聽哪些牌
            const waitTiles = logic.getWaitTiles(player.tepai);
            // 檢查聽的牌是否曾經被自己打過 (現物振聽)
            const isFuriten = [...waitTiles].some(waitTile => 
                player.river.some(r => r.tile === waitTile)
            );
            
            // 另外檢查：如果是立直狀態，是否處於「立直振聽」
            const isRiichiFuriten = player.isReach && player.riichiFuriten;

            // ★ 只有在「形狀成立」且「沒有振聽」時才榮和
            if (isShapeValid && !isFuriten && !isRiichiFuriten) {
                return { type: 'RON' };
            } else {
                console.log("AI 放棄榮和 (振聽或形狀不符)");
            }
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
    // ★★★ 修正重點 2：確保自摸邏輯正確 ★★★
    if (logic.isWinningHand(player.tepai, currentAnkanCount)) {
        // 這裡通常還需要判斷「是否有役 (Yaku)」，
        // 如果你的 logic.isWinningHand 只判斷形狀，
        // AI 可能會在「無役」時自摸導致犯規。
        // 但如果這是清一色練習，通常形狀對了就有役。
        return { type: 'TSUMO' };
    }

    // B. 檢查【暗槓】
    // 只有在非立直，或者立直後摸到的牌剛好可以暗槓才槓
    const waitSet = player.isReach ? player.riichiWaitSet : null;
    const ankanTiles = logic.getAnkanTiles(player.tepai, currentAnkanCount, waitSet);
    
    if (ankanTiles.length > 0) {
        // 簡單策略：有槓就槓 (進階 AI 可以判斷是否破壞手牌)
        return {
            type: 'ANKAN',
            tile: ankanTiles[0]
        };
    }

    // C. 檢查【立直後狀態】(強制摸切)
    if (player.isReach) {
        // 立直後只能切最後摸進來的那張 (通常是最後一張)
        // 除非有暗槓邏輯在上面被觸發
        return {
            type: 'DISCARD',
            tileIndex: player.tepai.length - 1
        };
    }

    // D. 檢查【是否要立直】
    // 只有門前清 (沒有吃碰明槓) 才能立直
    // 這裡假設 checkRiichi 內部有判斷門清
    if (checkRiichi(player, gameState)) {
        return { type: 'RIICHI' };
    }

    // E. 普通狀態：計算最佳切牌
    const bestDiscard = getBestDiscard(gameState, playerIndex);
    return {
        type: 'DISCARD',
        tileIndex: bestDiscard.tileIndex
    };
}
