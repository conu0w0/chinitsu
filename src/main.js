import { Game } from "./game.js";
import { UI } from "./ui.js";

// 1) 取得 Canvas（用 HTML 原本的 width/height，避免點擊座標對不起來）
const canvas = document.getElementById("game");

// 2) 初始化 UI
const ui = new UI(canvas);

// 3) 初始化 Game（狀態改變就更新 UI）
const game = new Game((gameState) => {
  console.log("UI Update:", gameState);
  ui.update(gameState);
});

// ========= 事件處理：單一入口，避免重複丟牌 =========
canvas.addEventListener("click", (e) => {
  if (!ui.state) return;
  if (ui.state.type === "GAME_OVER") return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const input = ui.handleClick(x, y);
  if (!input) return;

  // ---- 立直模式：只允許「點一張牌」完成立直切牌（確保只丟一次）----
  if (ui.isRiichiMode) {
    if (input.type === "DISCARD") {
      game.playerDiscard(input, true); // true = 宣告立直切牌
      ui.isRiichiMode = false;
    }
    // 立直模式下點按鈕/其他地方都忽略，避免亂送 action
    return;
  }

  // ---- 一般切牌：只要輪到你、且是 DRAW 階段，才允許丟牌 ----
  if (input.type === "DISCARD") {
    if (ui.state.playerIndex !== 0) return;
    if (ui.state.type !== "DRAW") return;
    game.playerDiscard(input);
    return;
  }

  // ---- 按鈕 ----
  if (input.type === "BUTTON") {
    handleButton(input.action);
  }
});

// ========= 按鈕行為 =========
function handleButton(action) {
  // 你不是當前操作玩家時：只允許 RON（如果你想把 RON 永遠留給玩家 0）
  const isMyTurnToAct = ui.state.playerIndex === 0;

  switch (action) {
    case "CANCEL": {
      // 取消立直選牌模式
      ui.isRiichiMode = false;

      // DISCARD 階段的 CANCEL 視為 PASS（不榮和）
      if (ui.state.type === "DISCARD") {
        game.playerAction("PASS");
      }
      // DRAW 階段的 CANCEL：什麼都不做，讓你繼續選擇要切哪張
      return;
    }

    case "RIICHI": {
      if (!isMyTurnToAct) return;
      if (ui.state.type !== "DRAW") return;
      if (ui.state.p0?.isRiichi) return; // 已立直就不能再立直

      // 進入立直待切模式：下一次點牌才會真正宣告立直+切牌
      ui.isRiichiMode = true;
      alert("請點擊一張牌進行立直切牌！");
      return;
    }

    case "KAN": {
      if (!isMyTurnToAct) return;
      if (ui.state.type !== "DRAW") return;

      // 從「目前 UI 狀態」找暗槓候選（用 p0.hand + incomingTile）
      const tileToKan = findKanCandidate(ui.state.p0?.hand || [], ui.state.incomingTile);

      // 找不到就不要送出（避免 null 槓 -> 畫面出現 null）
      if (tileToKan == null) {
        alert("目前沒有可暗槓的牌（或不允許槓）。");
        return;
      }

      game.playerAction("KAN", { kanTile: tileToKan });
      return;
    }

    case "TSUMO": {
      if (!isMyTurnToAct) return;
      if (ui.state.type !== "DRAW") return;

      // 依你規則：即使沒聽牌也能按（不合法你之後會做チョンボ）
      game.playerAction("TSUMO", { winTile: ui.state.incomingTile });
      return;
    }

    case "RON": {
      // 依你規則：對手舍牌後必定出現，玩家可按（不合法你之後會做チョンボ）
      game.playerAction("RON", { playerIndex: 0 });
      return;
    }

    default:
      return;
  }
}

// ========= 輔助：找暗槓候選 =========
// 回傳可槓的 tile 值（1~9），沒有則回傳 null
function findKanCandidate(hand, incoming) {
  const all = incoming != null ? [...hand, incoming] : [...hand];
  const counts = {};
  for (const x of all) counts[x] = (counts[x] || 0) + 1;
  for (const k in counts) if (counts[k] === 4) return parseInt(k, 10);
  return null;
}

// 5) 啟動遊戲
game.start();
