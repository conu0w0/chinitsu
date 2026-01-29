/**
 * ai/evaluateHand.js
 * 丟牌評估：進攻(手牌效率) + 防守(危險度) → 最終分數
 * 索子 only：tile 0~8 對應 1s~9s
 */

/* =========================
   參數組（可微調）
   ========================= */
const DEFENSE = {
  base: 10,
  genbutsuDanger: 0.2,      // 現物幾乎安全
  sujiDanger: 3.0,          // 筋：有降但不是 0
  kabeScale: 1.0,           // 壁減危險倍率
  tileBias: [-1.0, 0.5, 1.2, 1.6, 1.8, 1.6, 1.2, 0.5, -1.0], // 中張偏危險
  vsRiichiMultiplier: 1.45, // 對手立直：整體更危險
  min: 0
};

const MIX = {
  attackWeight: 1.0,
  defenseWeight: 1.4,
  defenseWeightVsRiichi: 2.4,
  tenpaiAttackBonus: 0.25
};

const ATTACK = {
  tenpaiBonus: 80,
  waitCountWeight: 10,
  structureWeight: 1.0
};

/* =========================
   對外：評估所有可丟牌
   ========================= */
export function evaluateDiscards(gameState, playerIndex, opponentIndex) {
  const player = gameState.players[playerIndex];
  const defenseCtx = buildDefenseContext(gameState, playerIndex, opponentIndex);

  const candidates = [];
  for (let i = 0; i < player.tepai.length; i++) {
    const tile = player.tepai[i];

    // 模擬丟掉這張
    const simulated = player.tepai.slice();
    simulated.splice(i, 1);

    const attackScore = evaluateAttack(gameState, simulated, playerIndex);
    const danger = evaluateDanger(tile, defenseCtx);
    const finalScore = mixScore(attackScore, danger, defenseCtx);

    candidates.push({
      tileIndex: i,
      tile,
      attackScore,
      danger,
      finalScore
    });
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);
  return { best: candidates[0], candidates };
}

/* =========================
   進攻：手牌效率
   ========================= */
function evaluateAttack(gameState, tilesAfterDiscard, playerIndex) {
  // 1) 結構分（你的回溯法）
  const structure = evaluateHandStructure(tilesAfterDiscard) * ATTACK.structureWeight;

  // 2) 等待數/聽牌（有效牌數）
  const waits = gameState.logic.getWaitTiles(tilesAfterDiscard);
  const waitCount = waits ? waits.size : 0;
  const isTenpai = waitCount > 0;

  return structure
    + (isTenpai ? ATTACK.tenpaiBonus : 0)
    + waitCount * ATTACK.waitCountWeight;
}

/* =========================
   防守：危險度
   ========================= */
function evaluateDanger(tile, ctx) {
  const { remaining, genbutsuSet, sujiSet, opponentRiichi } = ctx;

  // 現物 = 超安全
  if (genbutsuSet.has(tile)) return DEFENSE.genbutsuDanger;

  let danger = DEFENSE.base;

  // 筋：降低
  if (sujiSet.has(tile)) danger = Math.min(danger, DEFENSE.sujiDanger);

  // 中張偏危險
  danger += (DEFENSE.tileBias[tile] ?? 0);

  // 壁（完全壁/半壁）
  danger -= kabeReduction(tile, remaining) * DEFENSE.kabeScale;

  // 對手立直：整體放大
  if (opponentRiichi) danger *= DEFENSE.vsRiichiMultiplier;

  return Math.max(DEFENSE.min, danger);
}

/* =========================
   混分：attack - danger*權重
   ========================= */
function mixScore(attackScore, danger, ctx) {
  const wD = ctx.opponentRiichi ? MIX.defenseWeightVsRiichi : MIX.defenseWeight;
  const tenpaiBonus = ctx.selfTenpai ? MIX.tenpaiAttackBonus : 0;

  return (attackScore * MIX.attackWeight * (1 + tenpaiBonus)) - (danger * wD);
}

/* =========================
   防守上下文：現物/筋/剩枚/壁
   ========================= */
function buildDefenseContext(gameState, playerIndex, opponentIndex) {
  const player = gameState.players[playerIndex];
  const opponent = gameState.players[opponentIndex];

  // 現物（對手丟過）
  const genbutsuSet = new Set(opponent.river.map(r => r.tile));

  // 筋（對手丟 t → t±3）
  const sujiSet = new Set();
  for (const r of opponent.river) {
    const t = r.tile;
    if (t - 3 >= 0) sujiSet.add(t - 3);
    if (t + 3 <= 8) sujiSet.add(t + 3);
  }

  // visible：AI 看得到的牌（自己手牌、雙方河、雙方槓）
  const visible = Array(9).fill(0);

  for (const t of player.tepai) visible[t]++;

  for (const p of gameState.players) {
    for (const r of p.river) visible[r.tile]++;
  }

  // 你的 fulu 目前只有 ankan；暗槓視為 4 張可見（你也可改成只+0，看你 UI 設計）
  for (const p of gameState.players) {
    for (const f of p.fulu) {
      if (f.type === "ankan") visible[f.tile] += 4;
    }
  }

  const remaining = visible.map(v => Math.max(0, 4 - v));

  // 自己是否聽牌（用來稍微偏攻）
  const selfWaits = gameState.logic.getWaitTiles(player.tepai);
  const selfTenpai = selfWaits && selfWaits.size > 0;

  return {
    remaining,
    genbutsuSet,
    sujiSet,
    opponentRiichi: opponent.isReach,
    selfTenpai
  };
}

/* =========================
   壁（完全壁/半壁）
   - remaining[x]==0：完全壁
   - remaining[x]==1：半壁
   影響：鄰近牌更安全
   ========================= */
function kabeReduction(tile, remaining) {
  let reduce = 0;

  for (let wallTile = 0; wallTile <= 8; wallTile++) {
    const rem = remaining[wallTile];
    const isFull = rem === 0;
    const isHalf = rem === 1;

    if (!isFull && !isHalf) continue;

    const d1 = isFull ? 4 : 2; // 距離1
    const d2 = isFull ? 2 : 1; // 距離2

    const dist = Math.abs(tile - wallTile);
    if (dist === 1) reduce += d1;
    if (dist === 2) reduce += d2;
  }

  return reduce;
}

/* =========================================================
   你原本的：evaluateHandStructure（回溯拆解）
   ========================================================= */
export function evaluateHandStructure(tiles) {
  const counts = Array(9).fill(0);
  for (const t of tiles) {
    if (t >= 0 && t <= 8) counts[t]++;
  }
  const result = searchGroups(counts, 0, 0, 0);
  return calcStructureScore(result);
}

function searchGroups(counts, mentsu, tatsu, pair) {
  let bestResult = { mentsu, tatsu, pair };

  let i = -1;
  for (let k = 0; k < 9; k++) {
    if (counts[k] > 0) { i = k; break; }
  }
  if (i === -1) return bestResult;

  if (counts[i] >= 3) {
    counts[i] -= 3;
    const res = searchGroups(counts, mentsu + 1, tatsu, pair);
    if (calcStructureScore(res) > calcStructureScore(bestResult)) bestResult = res;
    counts[i] += 3;
  }

  if (i <= 6 && counts[i+1] > 0 && counts[i+2] > 0) {
    counts[i]--; counts[i+1]--; counts[i+2]--;
    const res = searchGroups(counts, mentsu + 1, tatsu, pair);
    if (calcStructureScore(res) > calcStructureScore(bestResult)) bestResult = res;
    counts[i]++; counts[i+1]++; counts[i+2]++;
  }

  if (counts[i] >= 2) {
    counts[i] -= 2;
    const res = searchGroups(counts, mentsu, tatsu, pair + 1);
    if (calcStructureScore(res) > calcStructureScore(bestResult)) bestResult = res;
    counts[i] += 2;
  }

  if (i <= 7 && counts[i+1] > 0) {
    counts[i]--; counts[i+1]--;
    const res = searchGroups(counts, mentsu, tatsu + 1, pair);
    if (calcStructureScore(res) > calcStructureScore(bestResult)) bestResult = res;
    counts[i]++; counts[i+1]++;
  }

  if (i <= 6 && counts[i+2] > 0) {
    counts[i]--; counts[i+2]--;
    const res = searchGroups(counts, mentsu, tatsu + 1, pair);
    if (calcStructureScore(res) > calcStructureScore(bestResult)) bestResult = res;
    counts[i]++; counts[i+2]++;
  }

  counts[i]--;
  const res = searchGroups(counts, mentsu, tatsu, pair);
  if (calcStructureScore(res) > calcStructureScore(bestResult)) bestResult = res;
  counts[i]++;

  return bestResult;
}

function calcStructureScore(r) {
  let m = r.mentsu;
  let p = r.pair;
  let t = r.tatsu;

  if (m > 4) m = 4;
  if (m + t > 4) t = 4 - m;
  if (p > 1) p = 1;

  return (m * 120) + (p * 40) + (t * 20);
}
