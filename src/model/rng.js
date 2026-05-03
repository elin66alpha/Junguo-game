export class SeededRng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  integer(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}
