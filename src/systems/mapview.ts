import type { TileGrid } from '../engine/tilegrid';
import type { LoadedArea } from '../engine/content';

/**
 * 地図のモザイク。エリアのタイルを 4×4 マスごとにまとめ、その範囲で一番多い色を1マスにする。
 * 描くのは原本の基本のタイルだけ（置いた物や、条件で現れる物は描かない）。
 */

export const MOSAIC = 4;

export interface Mosaic {
  w: number;
  h: number;
  /** null は何もない（虚空） */
  cells: (string | null)[];
}

export function buildMosaic(grids: TileGrid[], colorOf: (tileId: string) => string | undefined, w: number, h: number): Mosaic {
  const mw = Math.ceil(w / MOSAIC);
  const mh = Math.ceil(h / MOSAIC);
  const cells: (string | null)[] = [];
  for (let my = 0; my < mh; my++) {
    for (let mx = 0; mx < mw; mx++) {
      const counts = new Map<string, number>();
      for (let y = my * MOSAIC; y < Math.min(h, (my + 1) * MOSAIC); y++) {
        for (let x = mx * MOSAIC; x < Math.min(w, (mx + 1) * MOSAIC); x++) {
          // 一番上（後ろのレイヤー）に見えているタイルの色
          for (let i = grids.length - 1; i >= 0; i--) {
            const t = grids[i]!.get(x, y);
            const c = t ? colorOf(t) : undefined;
            if (c) {
              counts.set(c, (counts.get(c) ?? 0) + 1);
              break;
            }
          }
        }
      }
      let best: string | null = null;
      let bestN = 0;
      for (const [c, n] of counts) {
        if (n > bestN) {
          best = c;
          bestN = n;
        }
      }
      cells.push(best);
    }
  }
  return { w: mw, h: mh, cells };
}

/** 読み込んだエリアのモザイク（tiles レイヤーを書いた順に重ねる）。地図の画面と地図帳の解析で共有する */
export function areaMosaic(a: LoadedArea, colorOf: (tileId: string) => string | undefined): Mosaic {
  const grids = a.def.layers
    .map((l, i) => (l.type === 'tiles' ? (a.layerParams[i] as { id: string } | undefined)?.id : undefined))
    .filter((g): g is string => !!g)
    .map((g) => a.grids[g]!)
    .filter(Boolean);
  return buildMosaic(grids, colorOf, a.def.size[0], a.def.size[1]);
}
