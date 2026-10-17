import { TILE } from './constants';
import { gravityFrame } from './physics';
import type { View } from '../schema/area';
import type { ObjectDef, Placement } from '../schema/objects';

/**
 * 置いた物の位置・向き・当たり判定のマスを決める。Phaser に依存しない。
 * 物は重力の向きに「立つ」（上向きの重力なら天井から逆さに生える）。
 */

export interface ObjectLayout {
  /** 当たり判定のあるマス */
  cells: [number, number][];
  /** 足元（スプライトの下端の中央）の位置（px） */
  anchorX: number;
  anchorY: number;
  /** スプライトの回転（度）。プレイヤーと同じ決まり */
  angle: number;
}

export function layoutObject(
  p: Pick<Placement, 'at' | 'offset'>,
  def: Pick<ObjectDef, 'collision'>,
  spriteWidth: number,
  view: View,
  gravity: readonly [number, number],
): ObjectLayout {
  const [x, y] = p.at;
  const cells: [number, number][] = [];
  const frame = view === 'top' ? { axis: 'y' as const, sign: 1 as const } : gravityFrame(gravity);
  const axis = frame.axis ?? 'y';
  const sign = frame.axis === null ? 1 : frame.sign;

  const size = view === 'top' ? def.collision.top : def.collision.side;
  // 当たり判定がなければ、絵の幅を覆うマス数で中央をそろえる
  const w = size?.[0] ?? Math.max(1, Math.ceil(spriteWidth / TILE));
  const h = size?.[1] ?? 0;

  let anchorX: number;
  let anchorY: number;
  let angle = 0;
  const push = (cx: number, cy: number) => cells.push([cx, cy]);

  if (axis === 'y' && sign > 0) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) push(x + i, y - j);
    anchorX = (x + w / 2) * TILE;
    anchorY = (y + 1) * TILE;
  } else if (axis === 'y') {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) push(x + i, y + j);
    anchorX = (x + w / 2) * TILE;
    anchorY = y * TILE;
    angle = 180;
  } else if (sign > 0) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) push(x - j, y + i);
    anchorX = (x + 1) * TILE;
    anchorY = (y + w / 2) * TILE;
    angle = -90;
  } else {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) push(x + j, y + i);
    anchorX = x * TILE;
    anchorY = (y + w / 2) * TILE;
    angle = 90;
  }
  return { cells, anchorX: anchorX + p.offset[0], anchorY: anchorY + p.offset[1], angle };
}
