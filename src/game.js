import { Deck } from "./core/deck.js";
import { getAvailableActions } from "./core/actionCheck.js";
import { calculateResult } from "./core/winCheck.js";

export class Game {
  constructor(onStateChange) {
    this.onStateChange = onStateChange || (() => {});
    this.deck = null;
    this.players = [];
    this.turnIndex = 0;
    this.phase = "INIT";
    this.incomingTile = null; // 剛摸到的牌（不直接進 hand）
    this.lastDiscard = null;  // { tile, from }
    this.winner = null;
    this.lastDrawWasRinshan = false;
  }

  start() {
    this.deck = new Deck();
    this.deck.shuffle();
    this.players = [this.createPlayer(0), this.createPlayer(1)];
    this.dealHands();

    // 莊家固定 0
    this.turnIndex = 0;
    this.processDraw(false);
  }

  createPlayer(index) {
    return {
      index,
      score: 25000,
      hand: [],
      melds: [],
      discards: [],
      isRiichi: false,
      isDoubleRiichi: false,
      isIppatsu: false,
      firstTurn: true,
    };
  }

  dealHands() {
    for (let i = 0; i < 13; i++) {
      this.players[0].hand.push(this.deck.draw());
      this.players[1].hand.push(this.deck.draw());
    }
    this.sortHands();
  }

  sortHands() {
    this.players[0].hand.sort((a, b) => a - b);
    this.players[1].hand.sort((a, b) => a - b);
  }

  // === 摸牌 ===
  processDraw(isRinshan = false) {
    const player = this.players[this.turnIndex];
    this.lastDrawWasRinshan = !!isRinshan;

    if (this.deck.tiles.length === 0) {
      this.endGame(null, "流局");
      return;
    }

    this.incomingTile = this.deck.draw();
    this.phase = "DRAW";

    const isPlayerTurn = this.turnIndex === 0;

    // actionCheck 回傳 { buttons, kanTiles }
    const { buttons, kanTiles } = getAvailableActions(
      player,
      isPlayerTurn,
      this.incomingTile,
      "DRAW"
    );

    if (isPlayerTurn) {
      // 玩家回合：顯示 TSUMO/RIICHI/KAN/CANCEL（依 actionCheck）
      this.notifyUI(buttons, 0, { kanTiles });
    } else {
      // 電腦回合：隱藏所有按鈕
      this.notifyUI([], 1, { kanTiles: [] });

      // 電腦自動出牌（最簡單：摸切）
      this.aiAutoDiscard();
    }
  }

  // === 電腦出牌：摸切 ===
  aiAutoDiscard() {
    if (this.incomingTile == null) return;
    this.playerDiscard({ tile: this.incomingTile, from: "INCOMING" });
  }

  // === 切牌 ===
  playerDiscard(discardInput, isRiichiDeclaration = false) {
    const player = this.players[this.turnIndex];

    const discardTile =
      typeof discardInput === "object" ? discardInput.tile : discardInput;
    const from =
      typeof discardInput === "object" ? discardInput.from : null;
    const handIndex =
      typeof discardInput === "object" ? discardInput.index : null;

    if (isRiichiDeclaration) {
      player.isRiichi = true;
      if (player.firstTurn && player.melds.length === 0) player.isDoubleRiichi = true;
      player.isIppatsu = true;
    } else {
      if (player.isIppatsu) player.isIppatsu = false;
    }

    // === 依來源丟牌，避免數字相同誤判 ===
    if (from === "INCOMING") {
      // 丟剛摸到的
      this.incomingTile = null;
    } else {
      // 丟手牌（優先用 index）
      let idx = -1;
      if (Number.isInteger(handIndex) && player.hand[handIndex] === discardTile) {
        idx = handIndex;
      } else {
        idx = player.hand.indexOf(discardTile);
      }
      if (idx === -1) return;

      player.hand.splice(idx, 1);

      // 把摸到的那張補進手牌
      if (this.incomingTile !== null) {
        player.hand.push(this.incomingTile);
        this.incomingTile = null;
        player.hand.sort((a, b) => a - b);
      }
    }

    player.discards.push(discardTile);
    this.lastDiscard = { tile: discardTile, from: this.turnIndex };
    player.firstTurn = false;

    // 消除對手一發
    this.players[(this.turnIndex + 1) % 2].isIppatsu = false;

    // 電腦丟牌後：給玩家判斷 RON/CANCEL
    this.checkOpponentRon(discardTile);
  }

  // === 對手舍牌後：一定停住等玩家按 RON 或 CANCEL ===
  checkOpponentRon(tile) {
    this.phase = "DISCARD";

    const claimantIdx = (this.turnIndex + 1) % 2; // 可能榮和的人（玩家）
    const claimant = this.players[claimantIdx];

    const { buttons } = getAvailableActions(claimant, false, tile, "DISCARD");

    // 永遠切回玩家視角等待選擇（你規則：每張對手舍牌都給玩家判斷）
    this.notifyUI(buttons, 0, { kanTiles: [] });

    // 注意：這裡不 nextTurn()，要等玩家按 CANCEL -> PASS 才換巡
  }

  // === 玩家按鈕行為 ===
  playerAction(actionType, data = {}) {
    const player = this.players[this.turnIndex];

    if (actionType === "PASS") {
      this.nextTurn();
      return;
    }

    if (actionType === "CANCEL") {
      // DRAW 階段取消：不換巡，只是讓玩家繼續切牌（UI 端通常會收起模式）
      // DISCARD 階段取消：main.js 應該改送 PASS
      this.notifyUI([], 0, { kanTiles: [] });
      return;
    }

    if (actionType === "TSUMO") {
      this.handleWin(this.turnIndex, data.winTile, true);
      return;
    }

    if (actionType === "RON") {
      // data.playerIndex 是按按鈕的人（你目前固定玩家 0）
      this.handleWin(data.playerIndex, this.lastDiscard?.tile, false);
      return;
    }

    if (actionType === "KAN") {
      this.handleAnkan(player, data.kanTile);
      return;
    }
  }

  // === 暗槓 ===
  handleAnkan(player, tileVal) {
    if (tileVal == null) return;

    let removeCount = 0;

    // 先看 incoming
    if (this.incomingTile === tileVal) {
      this.incomingTile = null;
      removeCount++;
    }

    // 再看 hand（從後往前刪）
    for (let i = player.hand.length - 1; i >= 0; i--) {
      if (player.hand[i] === tileVal && removeCount < 4) {
        player.hand.splice(i, 1);
        removeCount++;
      }
    }

    if (removeCount !== 4) {
      // 防呆：不夠四張就不做
      return;
    }

    player.melds.push({
      type: "ankan",
      tiles: [tileVal, tileVal, tileVal, tileVal],
    });

    // 槓後補牌（你規則：直接摸牌山下一張，視為嶺上）
    this.processDraw(true);
  }

  // === 和牌處理（TSUMO/RON） ===
  handleWin(winnerIndex, winTile, isTsumo) {
    if (winnerIndex == null || winTile == null) {
      // 沒有有效和了牌，視為詐和
      this.applyChombo(winnerIndex ?? 0);
      return;
    }

    const winner = this.players[winnerIndex];

    // handTiles 必須是不含 winTile 的手牌（13 張）
    const handTiles = [...winner.hand];

    // 天和（簡化）：莊家首巡自摸，且未有人打出任何牌，且無副露
    const isTenhou =
      isTsumo &&
      winnerIndex === 0 &&
      winner.firstTurn === true &&
      this.players[0].discards.length === 0 &&
      this.players[1].discards.length === 0 &&
      winner.melds.length === 0;

    const ctx = {
      isTsumo,
      isTenhou,
      isRiichi: winner.isRiichi,
      isDoubleRiichi: winner.isDoubleRiichi,
      isIppatsu: winner.isIppatsu,
      melds: winner.melds,
      dora: [],
      isRinshan: !!this.lastDrawWasRinshan,
    };

    const result = calculateResult(handTiles, winTile, ctx);

    // result 為 null：詐和 -> チョンボ
    if (!result) {
      this.applyChombo(winnerIndex);
      return;
    }

    this.winner = winnerIndex;
    this.endGame(result, isTsumo ? "Tsumo" : "Ron");
  }

  // === チョンボ ===
  applyChombo(offenderIndex) {
    const offender = this.players[offenderIndex];
    const opponentIndex = (offenderIndex + 1) % 2;
    const opponent = this.players[opponentIndex];

    // 規則：親 48000、子 32000（目前莊家固定 0）
    const isDealer = offenderIndex === 0;
    const penalty = isDealer ? 48000 : 32000;

    offender.score -= penalty;
    opponent.score += penalty;

    const reason = offender.score < 0 ? "飛び" : "チョンボ";
    this.winner = opponentIndex;

    // UI 會顯示 han/fu/score，所以補齊欄位
    const result = {
      han: 0,
      fu: 0,
      score: -penalty,
      yaku: [{ name: "CHOMBO", han: 0 }],
    };

    this.endGame(result, reason);
  }

  // === 換巡 ===
  nextTurn() {
    this.turnIndex = (this.turnIndex + 1) % 2;
    this.incomingTile = null;
    this.processDraw(false);
  }

  // === 結束 ===
  endGame(result, reason) {
    this.phase = "END";
    this.notifyUI([], -1, { result, reason, winnerIndex: this.winner });
  }

  // === 統一通知 UI ===
  notifyUI(actions = [], activePlayerIdx = null, extraData = {}) {
    const idx = activePlayerIdx !== null ? activePlayerIdx : this.turnIndex;

    const state = {
      type: this.phase === "END" ? "GAME_OVER" : this.phase,
      playerIndex: idx,
      incomingTile: this.incomingTile,
      p0: this.players[0],
      p1: this.players[1],
      actions,
      ...extraData,
    };

    this.onStateChange(state);
  }
}
