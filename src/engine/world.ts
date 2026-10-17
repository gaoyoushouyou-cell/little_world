import type { SolidQuery } from './physics';
import type { SolidMap } from './tilegrid';
import type { Wrap } from '../schema/area';

/**
 * 世界の配置（タイル単位の世界座標）。
 * 地図上で辺が接しているエリアどうしは、接している部分が自動的に通路になる。
 * 重なっているエリアどうしはつながらない。
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedArea extends Rect {
  id: string;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** 辺が正の長さで接しているか（重なっている場合は false） */
export function shareEdge(a: Rect, b: Rect): boolean {
  if (rectsOverlap(a, b)) return false;
  const spanY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const spanX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const touchX = a.x + a.w === b.x || b.x + b.w === a.x;
  const touchY = a.y + a.h === b.y || b.y + b.h === a.y;
  return (touchX && spanY > 0) || (touchY && spanX > 0);
}

export class WorldMap {
  private readonly placed = new Map<string, PlacedArea>();
  private readonly adjacency = new Map<string, PlacedArea[]>();

  constructor(areas: PlacedArea[]) {
    for (const a of areas) this.placed.set(a.id, a);
    for (const a of areas) {
      this.adjacency.set(
        a.id,
        areas.filter((b) => b.id !== a.id && shareEdge(a, b)),
      );
    }
  }

  get(id: string): PlacedArea | undefined {
    return this.placed.get(id);
  }

  all(): PlacedArea[] {
    return [...this.placed.values()];
  }

  neighbors(id: string): PlacedArea[] {
    return this.adjacency.get(id) ?? [];
  }

  /** エリア id の外側にある世界座標 (wx, wy) を含む隣のエリア */
  neighborAt(id: string, wx: number, wy: number): PlacedArea | undefined {
    return this.neighbors(id).find((n) => rectContains(n, wx, wy));
  }
}

export function wrapsX(wrap: Wrap): boolean {
  return wrap === 'horizontal' || wrap === 'both';
}

export function wrapsY(wrap: Wrap): boolean {
  return wrap === 'vertical' || wrap === 'both';
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * エリアの当たり判定。エリアの外は、ループする端なら反対側、
 * 隣のエリアがあればそのエリアのタイル、どちらでもなければ壁。
 */
export function makeSolidQuery(
  area: { id: string; solid: SolidMap; wrap: Wrap },
  world: WorldMap,
  solidOf: (id: string) => SolidMap | undefined,
): SolidQuery {
  const placed = world.get(area.id);
  const { w, h } = area.solid;
  const wx = wrapsX(area.wrap);
  const wy = wrapsY(area.wrap);
  return (tx, ty) => {
    const x = wx ? mod(tx, w) : tx;
    const y = wy ? mod(ty, h) : ty;
    if (x >= 0 && y >= 0 && x < w && y < h) return area.solid.isSolid(x, y);
    if (!placed) return true;
    const gx = placed.x + x;
    const gy = placed.y + y;
    const n = world.neighborAt(area.id, gx, gy);
    if (!n) return true;
    const s = solidOf(n.id);
    if (!s) return false;
    return s.isSolid(gx - n.x, gy - n.y);
  };
}
