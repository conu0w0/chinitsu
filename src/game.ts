import { Deck } from "./core/deck";

export class Game {
  private deck!: Deck;

  constructor(private canvas: HTMLCanvasElement) {}

  start() {
    console.log("Chinitsu game started");

    this.deck = new Deck();
    this.deck.shuffle();

    console.log("tiles left:", this.deck.tiles.length);
  }
}
