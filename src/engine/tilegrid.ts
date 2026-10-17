/** タイル ID を並べた格子（null は空） */
export class TileGrid {
  constructor(
    readonly w: number,
    readonly h: number,
    readonly cells: (string | null)[],
  ) {}

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.cells[y * this.w + x] ?? null;
  }

  static fromRows(rows: string[], legend: Record<string, string | null>): TileGrid {
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const cells: (string | null)[] = [];
    for (const row of rows) {
      for (const ch of row) cells.push(legend[ch] ?? null);
    }
    return new TileGrid(w, h, cells);
  }
}

/** 当たり判定だけを持つ格子 */
export class SolidMap {
  readonly data: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h);
  }

  isSolid(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[y * this.w + x] === 1;
  }

  set(x: number, y: number, solid: boolean): void {
    this.data[y * this.w + x] = solid ? 1 : 0;
  }

  /** 文字の行から作る（テスト用）。# が固体 */
  static fromAscii(rows: string[]): SolidMap {
    const map = new SolidMap(rows[0]?.length ?? 0, rows.length);
    rows.forEach((row, y) => [...row].forEach((ch, x) => map.set(x, y, ch === '#')));
    return map;
  }
}
