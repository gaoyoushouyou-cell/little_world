import { makeRng } from '../engine/rng';
import type { SolidMap } from '../engine/tilegrid';
import type { Gather } from '../schema/economy';

/**
 * 揺らぎ区域に入るたびに散らばる素材。入った回数を種にするので、入り直すと並びが変わる。
 * 質はエリアの深さ（深いほど質が良い）。
 */

export interface Pickup {
  item: string;
  quality: number;
  tile: [number, number];
}

export function scatterPickups(
  gather: Gather,
  opts: { areaId: string; visit: number; depth: number; solid: SolidMap; avoid: (x: number, y: number) => boolean },
): Pickup[] {
  const rnd = makeRng(`${opts.areaId}:${opts.visit}`);
  const [min, max] = gather.count;
  const n = min + Math.floor(rnd() * (max - min + 1));
  const total = gather.items.reduce((s, i) => s + i.weight, 0);
  const pickItem = () => {
    let r = rnd() * total;
    for (const i of gather.items) {
      r -= i.weight;
      if (r <= 0) return i.item;
    }
    return gather.items[gather.items.length - 1]!.item;
  };
  const used = new Set<string>();
  const out: Pickup[] = [];
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const x = Math.floor(rnd() * opts.solid.w);
    const y = Math.floor(rnd() * opts.solid.h);
    const key = `${x},${y}`;
    if (used.has(key) || opts.solid.isSolid(x, y) || opts.avoid(x, y)) continue;
    used.add(key);
    out.push({ item: pickItem(), quality: opts.depth, tile: [x, y] });
  }
  return out;
}
