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
    this.incomingTile = null; 
    this.lastDiscard = null;  
    this.winner = null;
    this.lastDrawWasRinshan = false;
  }

  start() {
    this.deck = new Deck();
    this.deck.shuffle();
    this.players = [this.createPlayer(0), this.createPlayer(1)];
    this.dealHands();
    this.turnIndex = 0; // 莊家固定 0
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
    this.players.forEach(p => p.hand.sort((a, b) => a - b));
  }

  // === 核心流程：摸牌 ===
  processDraw(isRinshan = false) {
    if (this.deck.tiles.length === 0) {
      this.endGame(null, "流局");
      return;
    }

    const player = this.players[this.turnIndex];
    this.lastDrawWasRinshan = !!isRinshan;
    this.incomingTile = this.deck.draw();
    this.phase = "DRAW";

    const isPlayerTurn = (this.turnIndex === 0);
    const { buttons, kanTiles } = getAvailableActions(
      player,
      isPlayerTurn,
      this.incomingTile,
      "DRAW"
    );

    if (isPlayerTurn) {
      this.notifyUI(buttons, 0, { kanTiles });
    } else {
      this.notifyUI([], 1, { kanTiles: [] });
      // 電腦簡單邏輯：摸切
      setTimeout(() => this.aiAutoDiscard(), 500); 
    }
  }

  aiAutoDiscard() {
    if (this.incomingTile === null) return;
    this.playerDiscard({ tile: this.incomingTile, from: "INCOMING" });
  }

  // === 核心流程：打牌 ===
  playerDiscard(discardInput, isRiichiDeclaration = false) {
    const player = this.players[this.turnIndex];
    const { tile: discardTile, from, index: handIndex } = 
      typeof discardInput === "object" ? discardInput : { tile: discardInput, from: null };

    // 立直處理
    if (isRiichiDeclaration) {
      player.isRiichi = true;
      if (player.firstTurn && player.melds.length === 0) player.isDoubleRiichi = true;
      player.isIppatsu = true;
    } else {
      player.isIppatsu = false;
    }

    // 牌庫位移處理
    if (from === "INCOMING") {
      this.incomingTile = null;
    } else {
      const idx = (Number.isInteger(handIndex) && player.hand[handIndex] === discardTile)
        ? handIndex
        : player.hand.indexOf(discardTile);

      if (idx === -1) return; // 防錯

      player.hand.splice(idx, 1);
      if (this.incomingTile !== null) {
        player.hand.push(this.incomingTile);
        this.incomingTile = null;
        player.hand.sort((a, b) => a - b);
      }
    }

    player.discards.push(discardTile);
    this.lastDiscard = { tile: discardTile, from: this.turnIndex };
    player.firstTurn = false;
    
    // 消除對手一發狀態
    this.players[(this.turnIndex + 1) % 2].isIppatsu = false;

    this.checkOpponentRon(discardTile);
  }

  checkOpponentRon(tile) {
    this.phase = "DISCARD";
    const claimantIdx = (this.turnIndex + 1) % 2;
    const { buttons } = getAvailableActions(this.players[claimantIdx], false, tile, "DISCARD");
    
    // 等待玩家選擇 (RON 或 PASS)
    this.notifyUI(buttons, 0); 
  }

  // === 動作處理 ===
  playerAction(actionType, data = {}) {
    const player = this.players[this.turnIndex];

    switch (actionType) {
      case "PASS":
        this.nextTurn();
        break;
      case "CANCEL":
        this.notifyUI([], 0); // 關閉按鈕，讓玩家自由點擊手牌
        break;
      case "TSUMO":
        this.handleWin(this.turnIndex, data.winTile, true);
        break;
      case "RON":
        this.handleWin(data.playerIndex ?? 0, this.lastDiscard?.tile, false);
        break;
      case "KAN":
        this.handleAnkan(player, data.kanTile);
        break;
    }
  }

  handleAnkan(player, tileVal) {
    if (tileVal == null) return;

    let count = 0;
    if (this.incomingTile === tileVal) {
      this.incomingTile = null;
      count++;
    }
    for (let i = player.hand.length - 1; i >= 0; i--) {
      if (player.hand[i] === tileVal && count < 4) {
        player.hand.splice(i, 1);
        count++;
      }
    }

    if (count === 4) {
      player.melds.push({ type: "ankan", tiles: [tileVal, tileVal, tileVal, tileVal] });
      this.processDraw(true); // 嶺上摸牌
    }
  }

  // === 結算系統 ===
  handleWin(winnerIndex, winTile, isTsumo) {
    if (winTile == null) return this.applyChombo(winnerIndex);

    const winner = this.players[winnerIndex];
    const isTenhou = isTsumo && winnerIndex === 0 && winner.firstTurn && 
                     this.players[0].discards.length === 0 && this.players[1].discards.length === 0;

    const ctx = {
      isTsumo,
      isTenhou,
      isRiichi: winner.isRiichi,
      isDoubleRiichi: winner.isDoubleRiichi,
      isIppatsu: winner.isIppatsu,
      melds: winner.melds,
      dora: [], 
      isRinshan: this.lastDrawWasRinshan,
    };

    const result = calculateResult([...winner.hand], winTile, ctx);

    if (!result) {
      this.applyChombo(winnerIndex);
    } else {
      const loserIndex = isTsumo ? (winnerIndex + 1) % 2 : this.lastDiscard.from;
      this.applyWinPayment(winnerIndex, loserIndex, result, isTsumo);
      
      this.winner = winnerIndex;
      const reason = this.players[loserIndex].score < 0 ? "飛び" : (isTsumo ? "自摸" : "榮和");
      this.endGame(result, reason);
    }
  }

  applyWinPayment(winnerIndex, loserIndex, result, isTsumo) {
    const isDealer = (winnerIndex === 0);
    let pay = 0;

    if (result.isYakuman) {
      const mult = result.yakumanCount || 1;
      const base = isDealer ? 48000 : 32000;
      pay = base * mult;
      result.scoreName = mult > 1 ? `${mult}倍役滿` : "役滿";
    } else {
      pay = result.score || 0;
    }

    this.players[winnerIndex].score += pay;
    this.players[loserIndex].score -= pay;
    result.score = pay;
  }

  applyChombo(offenderIndex) {
    const opponentIndex = (offenderIndex + 1) % 2;
    const penalty = (offenderIndex === 0) ? 48000 : 32000;

    this.players[offenderIndex].score -= penalty;
    this.players[opponentIndex].score += penalty;
    this.winner = opponentIndex;

    this.endGame({
      han: 0, fu: 0, score: -penalty,
      yaku: [{ name: "詐和 (CHOMBO)", han: 0 }]
    }, "罰符");
  }

  nextTurn() {
    this.turnIndex = (this.turnIndex + 1) % 2;
    this.incomingTile = null;
    this.processDraw(false);
  }

  endGame(result, reason) {
    this.phase = "END";
    this.notifyUI([], -1, { result, reason, winnerIndex: this.winner });
  }

  notifyUI(actions = [], activePlayerIdx = null, extraData = {}) {
    const idx = activePlayerIdx !== null ? activePlayerIdx : this.turnIndex;
    this.onStateChange({
      type: this.phase === "END" ? "GAME_OVER" : this.phase,
      playerIndex: idx,
      incomingTile: this.incomingTile,
      p0: this.players[0],
      p1: this.players[1],
      actions,
      ...extraData,
    });
  }
}
