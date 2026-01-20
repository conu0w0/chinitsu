import { Game } from "./game.js";
import { UI } from "./ui.js";

// 1. 取得 Canvas
const canvas = document.getElementById("game");
// 設定適當大小 (如果 CSS 沒設)
canvas.width = 800;
canvas.height = 600;

// 2. 初始化 UI
const ui = new UI(canvas);

// 3. 初始化 Game (傳入 callback)
// 這個 callback 會在遊戲狀態改變時 (摸牌、切牌、計算完畢) 被呼叫
const game = new Game((gameState) => {
    // 為了讓 UI 能畫出手牌，我們需要把當前玩家的手牌塞進 gameState
    // *注意*：實際專案最好在 Game 內部處理好數據結構，這裡做一個簡單的補充
    if (game.players && game.players[0]) {
        gameState.hand = game.players[0].hand; // 永遠顯示 Player 0 (自己) 的手牌
    }
    
    console.log("UI Update:", gameState);
    ui.update(gameState);
});

// 4. 綁定點擊事件
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 詢問 UI 點到了什麼
    const input = ui.handleClick(x, y);

    if (input) {
        if (input.type === 'DISCARD') {
            console.log("Player discards:", input.tile);
            // 呼叫 Game 切牌
            game.playerDiscard(input.tile);
        } 
        else if (input.type === 'BUTTON') {
            console.log("Player action:", input.action);
            
            // 根據按鈕類型呼叫 Game
            if (input.action === 'CANCEL') {
                // 如果是取消，通常是為了不想暗槓或不想立直，視同不做動作
                // 但如果是榮和提示出來按取消，則是 PASS
                game.playerAction('PASS');
            }
            else if (input.action === 'KAN') {
                // 為了簡化，如果有多種槓材，UI 要跳視窗選。這裡假設直接槓第一種。
                // 這裡需要邏輯判斷槓哪張，暫時傳 null，需在 Game 裡實作「自動找能槓的牌」
                // 或者透過 ui.state 找到能槓的牌
                // *簡單版*：從手牌找第一組能槓的
                const tileToKan = findKanCandidate(game.players[0].hand, game.phase === 'DRAW' ? ui.state.incomingTile : null);
                game.playerAction('KAN', { kanTile: tileToKan });
            }
            else if (input.action === 'TSUMO') {
                game.playerAction('TSUMO', { winTile: ui.state.incomingTile });
            }
            else if (input.action === 'RON') {
                game.playerAction('RON', { playerIndex: 0 }); // 0號玩家宣告榮和
            }
            else if (input.action === 'RIICHI') {
                // 立直邏輯：先按立直，然後選擇切牌
                // 這裡簡化：按立直後，標記 flag，等待下一次切牌
                // 但我們的 playerDiscard 函式接收 isRiichi 參數
                // 所以 UI 應該變成：點立直 -> 進入「立直待切模式」 -> 點牌 -> 呼叫 discard(tile, true)
                alert("請點擊一張牌進行立直切牌！");
                ui.isRiichiMode = true; // 在 UI 加個 flag
            }
        }
    }
    
    // 特殊處理：立直模式下的切牌
    if (ui.isRiichiMode && input && input.type === 'DISCARD') {
        game.playerDiscard(input.tile, true); // true = 宣告立直
        ui.isRiichiMode = false;
    }
});

// 5. 啟動遊戲
game.start();

// --- 輔助：找槓材 ---
function findKanCandidate(hand, incoming) {
    const all = incoming ? [...hand, incoming] : [...hand];
    const counts = {};
    all.forEach(x => counts[x] = (counts[x]||0)+1);
    for(let k in counts) if(counts[k]===4) return parseInt(k);
    return null;
}
