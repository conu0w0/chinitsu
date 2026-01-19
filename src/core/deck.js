import { Tile } from "./tiles.js";

export class Deck {
  constructor() {
    this.tiles = [];
    this.init();
  }

  init() {
    this.tiles = [];
    for (let v = 1; v <= 9; v++) {
      for (let i = 0; i < 4; i++) {
        this.tiles.push(new Tile(v));
      }
    }
  }

  shuffle() {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  draw() {
    return this.tiles.pop();
  }
}
