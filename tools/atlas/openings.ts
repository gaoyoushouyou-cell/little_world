import { TILE } from '../../src/engine/constants';
import type { LoadedArea } from '../../src/engine/content';
import { gravityFrame, hasGroundBelow, overlapsSolid } from '../../src/engine/physics';
import { bodyOnTile, placeArrival, stepParamsFor } from '../../src/engine/travel';
import { makeSolidQuery, shareEdge, wrapsX, wrapsY, type PlacedArea } from '../../src/engine/world';
import { Walker } from '../lib/walker';
import type { Opening, Pass } from './schema';
import type { AtlasSource } from './source';

/**
 * 境界の口と通過試験（docs/design/14_dev_atlas.md 13.4、決定 76）。
 */

/** 地図で辺が接している 2 つのエリア */
export interface Border {
  a: string;
  b: string;
  axis: 'x' | 'y';
  /** ループする辺に接しているので通れない（ゲームはループを優先する） */
  wrapped: string[];
  openings: Opening[];
}

/** 試験で動かす最大のステップ数（60 ステップ = 1 秒） */
const MAX_STEPS = 240;

export function findBorders(src: AtlasSource): Border[] {
  const placed = src.world.all().sort((p, q) => p.id.localeCompare(q.id));
  const borders: Border[] = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      if (!shareEdge(a, b)) continue;
      borders.push(scanBorder(src, a, b));
    }
  }
  return borders;
}

function scanBorder(src: AtlasSource, a: PlacedArea, b: PlacedArea): Border {
  const axis: 'x' | 'y' = a.x + a.w === b.x || b.x + b.w === a.x ? 'x' : 'y';
  const wraps = axis === 'x' ? wrapsX : wrapsY;
  const wrapped = [a, b].filter((p) => wraps(src.areas.get(p.id)!.physics.wrap)).map((p) => p.id);
  const border: Border = { a: a.id, b: b.id, axis, wrapped, openings: [] };
  if (wrapped.length) return border;

  const la = src.getLoaded(a.id);
  const lb = src.getLoaded(b.id);
  if (!la || !lb) return border;

  // 境界のすぐ内側のマスどうしが、両方とも通れる区間を探す
  const cells: { world: [number, number]; open: boolean }[] = [];
  if (axis === 'x') {
    const [left, right] = a.x + a.w === b.x ? [a, b] : [b, a];
    const [ll, lr] = left === a ? [la, lb] : [lb, la];
    for (let y = Math.max(left.y, right.y); y < Math.min(left.y + left.h, right.y + right.h); y++) {
      const open = !ll.solid.isSolid(left.w - 1, y - left.y) && !lr.solid.isSolid(0, y - right.y);
      cells.push({ world: [right.x, y], open });
    }
  } else {
    const [top, bottom] = a.y + a.h === b.y ? [a, b] : [b, a];
    const [lt, lb2] = top === a ? [la, lb] : [lb, la];
    for (let x = Math.max(top.x, bottom.x); x < Math.min(top.x + top.w, bottom.x + bottom.w); x++) {
      const open = !lt.solid.isSolid(x - top.x, top.h - 1) && !lb2.solid.isSolid(x - bottom.x, 0);
      cells.push({ world: [x, bottom.y], open });
    }
  }

  let run: [number, number] | null = null;
  let count = 0;
  const flush = () => {
    if (!run) return;
    const op: Opening = {
      id: `adj:${a.id}|${b.id}#${border.openings.length}`,
      a: a.id,
      b: b.id,
      axis,
      world: run,
      cells: count,
      pass: { 'a>b': 'fail', 'b>a': 'fail' },
    };
    op.pass['a>b'] = passTest(src, op, a, b);
    op.pass['b>a'] = passTest(src, op, b, a);
    border.openings.push(op);
    run = null;
    count = 0;
  };
  for (const c of cells) {
    if (c.open) {
      if (!run) run = c.world;
      count++;
    } else flush();
  }
  flush();
  return border;
}

/**
 * from から to へ、口を越えられるかを物理で試す。
 * 口の近くの足場に立ち、口の向こう側の点へ向かって歩く。だめなら跳びながらもう一度。
 */
function passTest(src: AtlasSource, op: Opening, from: PlacedArea, to: PlacedArea): Pass {
  const lf = src.getLoaded(from.id)!;
  const { axis, world, cells } = op;
  // 口の中央と、その向こう側の点（from のエリアの中の px 座標）
  const mid = (cells - 1) / 2;
  const across = axis === 'x' ? Math.sign(to.x - from.x) : Math.sign(to.y - from.y);
  const boundaryTile = axis === 'x' ? (across > 0 ? from.w : -1) : across > 0 ? from.h : -1;
  const target =
    axis === 'x'
      ? { x: (boundaryTile + 0.5) * TILE, y: (world[1] - from.y + mid + 0.5) * TILE }
      : { x: (world[0] - from.x + mid + 0.5) * TILE, y: (boundaryTile + 0.5) * TILE };

  // 立つ位置：口の中の、重力の向きで一番「下」のマスから 2 マス内側
  const params = stepParamsFor(lf.def);
  const { axis: gAxis, sign } = gravityFrame(params.gravity);
  const sideLike = params.view === 'side' && gAxis !== null;
  let along = Math.round(mid);
  if (sideLike && gAxis !== axis) along = sign > 0 ? cells - 1 : 0;
  const inward = across > 0 ? -2 : 2;
  const tile: [number, number] =
    axis === 'x'
      ? [boundaryTile + inward, world[1] - from.y + along]
      : [world[0] - from.x + along, boundaryTile + inward];
  tile[0] = Math.min(Math.max(tile[0], 0), from.w - 1);
  tile[1] = Math.min(Math.max(tile[1], 0), from.h - 1);
  const at = startSpot(src, lf, tile, sideLike);
  if (!at) return 'fail';

  for (const jump of [false, true]) {
    const w = new Walker(src, from.id, { kind: 'restore', at });
    for (let i = 0; i < MAX_STEPS && w.area.def.id === from.id; i++) {
      const cx = w.body.x + w.body.w / 2;
      const cy = w.body.y + w.body.h / 2;
      const dx = target.x - cx;
      const dy = target.y - cy;
      w.step({
        x: Math.abs(dx) > 1 ? Math.sign(dx) : 0,
        y: Math.abs(dy) > 1 ? Math.sign(dy) : 0,
        jumpHeld: jump,
        jumpPressed: jump && w.body.grounded,
      });
    }
    if (w.area.def.id === to.id) return jump ? 'jump' : 'walk';
  }
  return 'fail';
}

/**
 * 試験の立ち位置。ゲームの安全な位置の探索は隣のエリアの足場まで探すので使わず、
 * このエリアの中で、ideal に近い順に「壁に埋まらず、（横視点では）足場に立てる」マスを探す。
 * 見つからなければ ideal の空中から始める（下へ落ちて越える口のため）。
 */
function startSpot(src: AtlasSource, la: LoadedArea, ideal: [number, number], sideLike: boolean): { x: number; y: number } | null {
  const params = stepParamsFor(la.def);
  const solid = makeSolidQuery({ id: la.def.id, solid: la.solid, wrap: la.def.physics.wrap }, src.world, (id) => src.getLoaded(id)?.solid);
  const [w, h] = la.def.size;
  const fits = (b: { x: number; y: number; w: number; h: number }) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return cx >= 0 && cy >= 0 && cx < w * TILE && cy < h * TILE && !overlapsSolid(b.x, b.y, b.w, b.h, solid);
  };
  const candidates: [number, number][] = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) candidates.push([ideal[0] + dx, ideal[1] + dy]);
  candidates.sort((p, q) => Math.hypot(p[0] - ideal[0], p[1] - ideal[1]) - Math.hypot(q[0] - ideal[0], q[1] - ideal[1]));
  for (const t of candidates) {
    const b = bodyOnTile(t, params);
    if (fits(b) && (!sideLike || hasGroundBelow(b.x, b.y, b.w, b.h, params.gravity, solid, 2))) return { x: b.x, y: b.y };
  }
  const air = bodyOnTile(ideal, params);
  return fits(air) ? { x: air.x, y: air.y } : null;
}

export interface Landing {
  /** 何の位置か（例：spawn:bed_room/start、warp:bed_to_field の行き先） */
  ref: string;
  area: string;
  tile: [number, number];
  ok: boolean;
  /** 指定の位置から実際に立つ位置までのマス数 */
  moved: number;
}

/** その足元のタイルに、壁に埋まらず（横視点では足場の上に）立てるか */
export function checkLanding(src: AtlasSource, ref: string, area: string, tile: [number, number]): Landing | null {
  const la: LoadedArea | undefined = src.getLoaded(area);
  if (!la) return null;
  const params = stepParamsFor(la.def);
  const solid = makeSolidQuery({ id: area, solid: la.solid, wrap: la.def.physics.wrap }, src.world, (id) => src.getLoaded(id)?.solid);
  const b = placeArrival({ kind: 'tile', tile }, params, solid);
  const sideLike = params.view === 'side' && gravityFrame(params.gravity).axis !== null;
  const ok = !overlapsSolid(b.x, b.y, b.w, b.h, solid) && (!sideLike || hasGroundBelow(b.x, b.y, b.w, b.h, params.gravity, solid, TILE * 3));
  const moved = Math.max(
    Math.abs(Math.floor((b.x + b.w / 2) / TILE) - tile[0]),
    Math.abs(Math.floor((b.y + b.h / 2) / TILE) - tile[1]),
  );
  return { ref, area, tile, ok, moved };
}
