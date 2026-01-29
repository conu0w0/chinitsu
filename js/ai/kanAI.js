/**
 * js/ai/kanAI.js
 * 決策：要不要暗槓
 */

export function checkAnkan(player, gameState) {
    // 取得所有可以暗槓的牌
    const kanCount = player.fulu.filter(f => f.type === "ankan").length;
    
    // 注意：立直後只能槓「不改變聽牌」的牌，這邏輯在 core/logic 裡有，
    // 但 AI 這邊先簡化，立直後不槓
    if (player.isReach) return null;

    const possibleAnkans = gameState.logic.getAnkanTiles(player.tepai, kanCount, null);

    if (possibleAnkans.length === 0) return null;

    // 策略：只有 15% 機率槓 (避免破壞門清或隨便槓)
    // 進階 AI 會判斷槓完向聽數是否下降，這邊先隨機
    if (Math.random() > 0.85) {
        return possibleAnkans[0]; // 回傳要槓的那張牌 (Tile Index)
    }

    return null;
}
