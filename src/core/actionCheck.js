/**
 * actionCheck.js
 * 決定 UI 該顯示哪些操作按鈕，以及可用的暗槓候選
 */

import { getWaitingTiles } from "./winCheck.js";

/**
 * 取得當前可用的操作
 * @param {Object} player
 * @param {boolean} isMyTurn - 是否輪到「這個 player」行動
 * @param {number|null} incomingTile - 進張（自己摸牌 / 對手舍牌）
 * @param {string} phase - 'DRAW' | 'DISCARD'
 * @returns {{buttons: string[], kanTiles: number[]}}
 */
export function getAvailableActions(player, isMyTurn, incomingTile, phase) {
  const buttons = [];
  let kanTiles = [];

  // === 自己回合：摸牌後、切牌前 ===
  if (isMyTurn && phase === "DRAW") {
    // [自摸]：依你規則「必定出現」（不管是否聽牌，按了可能是詐和 -> 之後算チョンボ）
    buttons.push("TSUMO");

    // [立直]：未立直時「必定出現」
    if (!player.isRiichi) {
      buttons.push("RIICHI");
    }

    // [槓]：只有符合暗槓條件才出現
    // 立直後需額外檢查：不能破壞原本聽牌
    kanTiles = checkAnkan(player.hand, incomingTile, player.isRiichi, player.melds);
    if (kanTiles.length > 0) {
      buttons.push("KAN");
    }
  }

  // === 對手舍牌後：給玩家判斷是否榮和 ===
  if (!isMyTurn && phase === "DISCARD") {
    // [榮和]：依你規則「必定出現」（不管是否聽牌）
    buttons.push("RON");
  }

  // [取消]：只要有任何按鈕，就必定伴隨出現
  if (buttons.length > 0) {
    buttons.push("CANCEL");
  }

  return { buttons, kanTiles };
}

/**
 * 檢查暗槓候選
 * @returns {number[]} 可槓的牌值列表（例如 [3, 7]）
 */
function checkAnkan(hand, drawTile, isRiichi, melds) {
  if (drawTile == null) return [];

  // 統計「手牌 + 摸牌」
  const allTiles = [...hand, drawTile].sort((a, b) => a - b);
  const counts = {};
  for (const t of allTiles) counts[t] = (counts[t] || 0) + 1;

  const possibleKans = [];

  for (const tileStr in counts) {
    if (counts[tileStr] !== 4) continue;
    const kanTile = parseInt(tileStr, 10);

    // 未立直：有 4 張就能槓
    if (!isRiichi) {
      possibleKans.push(kanTile);
      continue;
    }

    // 已立直：要做「立直後暗槓合法性」檢查
    if (checkRiichiKanValidity(hand, drawTile, kanTile, melds)) {
      possibleKans.push(kanTile);
    }
  }

  return possibleKans;
}

/**
 * 立直後暗槓合法性檢查（你描述的規則）
 * 1) 立直後只能槓「剛摸到的牌」
 * 2) 槓後不能改變原本的聽牌（machi）
 */
function checkRiichiKanValidity(hand, drawTile, kanTile, melds) {
  // 規則1：必須槓剛摸到的那張
  if (kanTile !== drawTile) return false;

  // A) 槓前：用 13 張 hand 計算原本聽牌
  const originalWaits = getWaitingTiles(hand, melds);
  if (originalWaits.length === 0) return false; // 你原註解：詐立直時不允許槓

  // B) 槓後：移除 4 張 kanTile，加入暗槓 meld，再計算聽牌
  // 注意：這裡要「只移除 4 張」，不能用 filter（會把所有同值都移掉）
  const temp = [...hand, drawTile]; // 這時是 14 張
  let removed = 0;
  const newHand = [];
  for (const t of temp) {
    if (t === kanTile && removed < 4) {
      removed++;
    } else {
      newHand.push(t);
    }
  }
  if (removed !== 4) return false;

  const newMelds = [...(melds || []), { type: "ankan", tiles: [kanTile, kanTile, kanTile, kanTile] }];
  const newWaits = getWaitingTiles(newHand, newMelds);

  // C) 比對聽牌集合是否完全相同（用集合比，避免排序差異）
  if (originalWaits.length !== newWaits.length) return false;

  const a = [...originalWaits].sort((x, y) => x - y);
  const b = [...newWaits].sort((x, y) => x - y);

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}
