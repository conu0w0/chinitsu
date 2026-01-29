/**
 * js/ai/discardAI.js
 * 決策：切哪張牌（進攻/防守整合版）
 */

import { evaluateDiscards } from "./evaluateHand.js";

export function getBestDiscard(gameState, playerIndex) {
  const opponentIndex = (playerIndex + 1) % 2;
  const player = gameState.players[playerIndex];

  const { candidates } = evaluateDiscards(gameState, playerIndex, opponentIndex);

  // 你原本的「邊張優先切」微調：當 finalScore 很接近時，用 centrality 做 tie-break
  // 讓 AI 不會亂切中張
  const centralityOf = (tile) =>
    (tile === 0 || tile === 8) ? 0 :
    (tile === 1 || tile === 7) ? 0.1 :
    (tile === 2 || tile === 6) ? 0.2 : 0.3;

  // candidates 已經依 finalScore 排序（evaluateDiscards 內排過）
  // 但我們再做一次「接近分數」的 tie-break
  const EPS = 0.75; // 分差在這以內視為接近（可調）

  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c.finalScore - best.finalScore) <= EPS) {
      // 分數接近：切掉 centrality 較小的（邊張比較小 → 更想切）
      const cb = centralityOf(best.tile);
      const cc = centralityOf(c.tile);
      if (cc < cb) best = c;
    } else {
      // 後面只會更差（已排序），可以停
      break;
    }
  }

  // 回傳格式統一：tileIndex / tile / score
  return {
    tileIndex: best.tileIndex,
    tile: player.tepai[best.tileIndex],
    score: best.finalScore,
    attackScore: best.attackScore,
    danger: best.danger
  };
}
