import { TILE } from '../engine/constants';
import type { LoadedArea, PlacedObject } from '../engine/content';
import { SolidMap } from '../engine/tilegrid';
import type { PlacedRecord } from './save';

/**
 * 建築モード（決定 51〜55）の計算。Phaser に依存しない。
 * エリアの物 = 原本の物（しまったものを除く）＋ 置いた物（セーブの上書き層）。
 * 当たり判定 = タイルだけの当たり判定 ＋ その物の当たり判定。
 */

export type Tile = [number, number];

/** 原本の物を見分けるキー（しまったことの記録に使う） */
export const contentKey = (p: { object: string; at: Tile }) => `${p.object}@${p.at[0]},${p.at[1]}`;

export type ObjectSource = { kind: 'content'; key: string } | { kind: 'placed'; index: number };

/** 画面にある物と、それがどこから来たか */
export type SceneObject = PlacedObject & { source: ObjectSource };

export function composeObjects(
  area: LoadedArea,
  placed: readonly PlacedRecord[],
  hidden: readonly string[],
  make: (rec: PlacedRecord) => PlacedObject | undefined,
): SceneObject[] {
  const hide = new Set(hidden);
  const out: SceneObject[] = [];
  for (const o of area.objects) {
    const key = contentKey(o.placement);
    if (!hide.has(key)) out.push({ ...o, source: { kind: 'content', key } });
  }
  placed.forEach((rec, index) => {
    const o = make(rec);
    if (o) out.push({ ...o, source: { kind: 'placed', index } });
  });
  return out;
}

export function composeSolid(tileSolid: SolidMap, cellsOf: readonly (readonly Tile[])[]): SolidMap {
  const solid = new SolidMap(tileSolid.w, tileSolid.h);
  solid.data.set(tileSolid.data);
  for (const cells of cellsOf) for (const [x, y] of cells) if (x >= 0 && y >= 0 && x < solid.w && y < solid.h) solid.set(x, y, true);
  return solid;
}

/**
 * 物が床を占めるマス。当たり判定があればそのマス、なければ足元の列（絵の幅のマス数）。
 * ほかの物との重なりを調べるのに使う（当たり判定のない飾りも重ねて置けないようにする）
 */
export function footprint(at: Tile, cells: readonly Tile[], spriteWidth: number): Tile[] {
  if (cells.length) return cells.map(([x, y]) => [x, y]);
  const w = Math.max(1, Math.ceil(spriteWidth / TILE));
  return Array.from({ length: w }, (_, i): Tile => [at[0] + i, at[1]]);
}

const keyOf = ([x, y]: Tile) => `${x},${y}`;

/** start から歩いて（上下左右に、固くないマスを通って）行ける大事なマスの数 */
export function reachableCount(solid: SolidMap, starts: readonly Tile[], targets: readonly Tile[]): number {
  const want = new Set(targets.filter(([x, y]) => !solid.isSolid(x, y)).map(keyOf));
  const seen = new Uint8Array(solid.w * solid.h);
  const queue: Tile[] = [];
  for (const [x, y] of starts) {
    if (x < 0 || y < 0 || x >= solid.w || y >= solid.h || solid.isSolid(x, y)) continue;
    seen[y * solid.w + x] = 1;
    queue.push([x, y]);
  }
  let found = 0;
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]!;
    if (want.delete(keyOf([x, y]))) found++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= solid.w || ny >= solid.h) continue;
      const k = ny * solid.w + nx;
      if (seen[k] || solid.isSolid(nx, ny)) continue;
      seen[k] = 1;
      queue.push([nx, ny]);
    }
  }
  return found;
}

export interface PlacementQuery {
  tileSolid: SolidMap;
  /** 今ある物（それぞれの当たり判定のマスと床を占めるマス） */
  others: readonly { cells: readonly Tile[]; footprint: readonly Tile[] }[];
  /** 置こうとしている物 */
  candidate: { cells: readonly Tile[]; footprint: readonly Tile[] };
  /** 出入口・ワープ・出現位置のマス（置けない） */
  blocked: readonly Tile[];
  /** 歩いて行けなくしてはいけないマス（出現位置と出入口） */
  starts: readonly Tile[];
  targets: readonly Tile[];
  /** プレイヤーが今いるマス（当たり判定を重ねない） */
  player: readonly Tile[];
}

/** 置けるなら null、置けないなら理由 */
export function placementProblem(q: PlacementQuery): string | null {
  const { w, h } = q.tileSolid;
  const cand = [...q.candidate.footprint, ...q.candidate.cells];
  if (cand.some(([x, y]) => x < 0 || y < 0 || x >= w || y >= h)) return 'エリアの外にはみ出す';
  if (cand.some(([x, y]) => q.tileSolid.isSolid(x, y))) return '壁と重なる';
  const taken = new Set(q.others.flatMap((o) => [...o.footprint, ...o.cells]).map(keyOf));
  if (cand.some((t) => taken.has(keyOf(t)))) return 'ほかの物と重なる';
  const blocked = new Set(q.blocked.map(keyOf));
  if (cand.some((t) => blocked.has(keyOf(t)))) return '出入口の上には置けない';
  const player = new Set(q.player.map(keyOf));
  if (q.candidate.cells.some((t) => player.has(keyOf(t)))) return '自分と重なる';
  if (q.candidate.cells.length) {
    const before = composeSolid(q.tileSolid, q.others.map((o) => o.cells));
    const after = composeSolid(before, [q.candidate.cells]);
    if (reachableCount(after, q.starts, q.targets) < reachableCount(before, q.starts, q.targets)) return '出入口への道をふさぐ';
  }
  return null;
}
