export type TileValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export class Tile {
  value: TileValue;

  constructor(value: TileValue) {
    this.value = value;
  }

  toString() {
    return this.value.toString();
  }
}
