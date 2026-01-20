import { Game } from "./game.js";
import { UI } from "./ui.js";

// Canvas
const canvas = document.getElementById("game");

// UI
const ui = new UI(canvas);

// Game
const game = new Game((gameState) => {
  console.log("UI Update:", gameState);
  ui.update(gameState);
});

// Click handler
canvas.addEventListener("click", (e) => {
  if (!ui.state) return;
  if (ui.state.type === "GAME_OVER") return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const input = ui.handleClick(x, y);
  if (!input) return;

  // --- 立直待切模式：只允許點牌一次完成「立直切牌」(避免切兩次/切多張) ---
  if (ui.isRiichiMode) {
    if (input.type === "DISCARD") {
      game.playerDiscard(input, true); // true = 宣告立直切牌
      ui.isRiichiMode = false;
    }
    // 立直模式下點按鈕或其他地方都忽略
    return;
  }

  // --- 切牌（只在輪到玩家操作 且 DRAW 階段才允許） ---
  if (input.type === "DISCARD") {
    if (ui.state.playerIndex !== 0) return;
    if (ui.state.type !== "DRAW") return;
    game.playerDiscard(input);
    return;
  }

  // --- 按鈕 ---
  if (input.type === "BUTTON") {
    handleButton(input.action);
  }
});

// Button actions
function handleButton(action) {
  if (!ui.state) return;

  // 只讓「目前可操作的人」按按鈕
  // 你希望：對手回合隱藏；對手舍牌後才顯示 RON/CANCEL 給玩家
  // 所以 playerIndex 應該在那個時機被 Game 設成 0
  if (ui.state.playerIndex !== 0) return;

  switch (action) {
    case "CANCEL": {
      // 取消立直選牌模式
      ui.isRiichiMode = false;

      // DISCARD 階段：取消 = PASS（不榮和，遊戲繼續）
      if (ui.state.type === "DISCARD") {
        game.playerAction("PASS");
      } else {
        // DRAW 階段：取消 = 收起動作，讓你照常切牌
        // 如果你 Game 有支援 CANCEL（我之前建議加的），就用它
        // 沒有也不影響：你仍可直接點牌切牌
        game.playerAction("CANCEL");
      }
      return;
    }

    case "RIICHI": {
      // 依你規則：自己回合且未立直就必定可出現
      // 實際「能不能按」你應由 actions 決定；main.js 只負責進入模式
      if (ui.state.p0?.isRiichi) return;
      if (ui.state.type !== "DRAW") return;

      ui.isRiichiMode = true;
      alert("請點擊一張牌進行立直切牌！");
      return;
    }

    case "KAN": {
      // 依你規則：有 4 張同牌才可出現；立直後還要檢查不破壞聽牌型
      // 這些條件應該在 getAvailableActions 裡決定是否提供 'KAN'
      if (ui.state.type !== "DRAW") return;

      const tileToKan = findKanCandidate(ui.state.p0?.hand || [], ui.state.incomingTile);
      if (tileToKan == null) {
        // 如果 actions 有 'KAN' 但找不到候選，代表資料不同步；避免送出 null
        console.warn("KAN pressed but no candidate found.");
        return;
      }

      game.playerAction("KAN", { kanTile: tileToKan });
      return;
    }

    case "TSUMO": {
      // 依你規則：自己回合一定會出現（不管是否聽牌）
      if (ui.state.type !== "DRAW") return;
      game.playerAction("TSUMO", { winTile: ui.state.incomingTile });
      return;
    }

    case "RON": {
      // 依你規則：對手舍牌後必定出現（不管是否聽牌）
      if (ui.state.type !== "DISCARD") return;
      game.playerAction("RON", { playerIndex: 0 });
      return;
    }

    default:
      return;
  }
}

// Find ankan candidate (1~9) or null
function findKanCandidate(hand, incoming) {
  const all = incoming != null ? [...hand, incoming] : [...hand];
  const counts = {};
  for (const x of all) counts[x] = (counts[x] || 0) + 1;
  for (const k in counts) if (counts[k] === 4) return parseInt(k, 10);
  return null;
}

// Start
game.start();
