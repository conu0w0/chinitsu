import { Deck } from "./core/deck.js";

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.deck = null;
  }

  start() {
    console.log("Chinitsu game started");

    this.deck = new Deck();
    this.deck.shuffle();

    console.log("tiles left:", this.deck.tiles.length);
  }
}
