/**
 * js/ai/ai.js
 * COM 決策入口
 */

import { getBestDiscard } from './discardAI.js';
import { checkRiichi } from './riichiAI.js';
import { checkAnkan } from './kanAI.js';

export function decideComAction(gameState, playerIndex) {
    const player = gameState.players[playerIndex];
    const phase = gameState.phase;

    // === 1. 回應他人切牌 (榮和/槓) ===
    if (phase === "REACTION_DECISION") {
        if (gameState.getLegalActions(playerIndex).canRon) {
            console.log("🤖 COM: 榮和！抓到了！");
            return { type: 'RON' };
        }
        return { type: 'CANCEL' };
    }

    // === 2. 自己的回合 ===
    if (phase === "PLAYER_DECISION") {
        
        // A. 自摸檢查
        const kanCount = player.fulu.filter(f => f.type === "ankan").length;
        if (gameState.logic.isWinningHand(player.tepai, kanCount)) {
            console.log("🤖 COM: 自摸！想跑？想都別想！");
            return { type: 'TSUMO' };
        }

        // B. 暗槓檢查
        const tileToKan = checkAnkan(player, gameState);
        if (tileToKan !== null) {
            // 如果只有一種選擇，直接 TRY_ANKAN 會觸發邏輯判斷
            // 為了配合 GameState 狀態機，我們先發送嘗試訊號
            return { type: 'TRY_ANKAN' }; 
        }

        // C. 立直檢查
        if (checkRiichi(player, gameState)) {
            console.log("🤖 COM: 立直！嗷嗚嗷嗚～");
          
            const isFirstTurn = player.river.length === 0 && gameState.players.every(p => p.fulu.length === 0);
            
            if (isFirstTurn) {
                console.log("🤖 COM: 兩立直！怕了吧～ ✨");
            }
            return { type: 'RIICHI' };
        }

        // D. 思考切牌
        // 這裡做一個小延遲的感覺，可以直接回傳
        const best = getBestDiscard(player.tepai);
        return { type: 'DISCARD', tileIndex: best.index };
    }

    // === 3. 特殊狀態處理 ===

    // 如果 AI 決定立直，GameState 會切換到 RIICHI_DECLARATION
    // 這時候 AI 需要再次確認切哪張牌 (通常就是剛剛算的那張)
    if (phase === "RIICHI_DECLARATION") {
        const best = getBestDiscard(player.tepai);
        return { type: 'DISCARD', tileIndex: best.index };
    }

    // 如果 AI 決定暗槓且有多種選擇 (雖然 kanAI 目前只回傳一種)
    if (phase === "ANKAN_SELECTION") {
        const tileToKan = checkAnkan(player, gameState);
        if (tileToKan !== null) {
            return { type: 'ANKAN', tile: tileToKan };
        }
        return { type: 'CANCEL' };
    }

    return { type: 'CANCEL' };
}
