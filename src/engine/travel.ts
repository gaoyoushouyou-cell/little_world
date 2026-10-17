import { PLAYER_SIDE_BOX, PLAYER_TOP_BOX, TILE } from './constants';
import { findSafeSpot, gravityFrame, makeBody, overlapsSolid, type Body, type SolidQuery, type StepParams } from './physics';
import { wrapsX, wrapsY, type PlacedArea, type WorldMap } from './world';
import type { Area, View } from '../schema/area';

/**
 * エリア間の移動（端の通過・ループ・出現位置）。Phaser に依存しない。
 */

export type Arrival =
  /** 端を越えて入ってきた。at はこのエリアでの当たり判定の左上（px） */
  | { kind: 'edge'; at: { x: number; y: number }; vel: { vx: number; vy: number }; fromView: View; fromGravity: [number, number] }
  /** 扉・ワープ・開始位置。tile は足元のタイル */
  | { kind: 'tile'; tile: [number, number] }
  /** 開発中の再読み込みからの復帰 */
  | { kind: 'restore'; at: { x: number; y: number } };

export function boxFor(view: View): { w: number; h: number } {
  return view === 'top' ? PLAYER_TOP_BOX : PLAYER_SIDE_BOX;
}

export function stepParamsFor(def: Area): StepParams {
  const { physics } = def;
  return {
    view: def.view,
    gravity: def.view === 'top' ? [0, 0] : physics.gravity,
    friction: physics.friction,
    airFriction: physics.airFriction,
    accel: physics.accel,
    maxSpeed: physics.maxSpeed,
    jump: physics.jump,
    maxFall: physics.maxFall,
  };
}

function sideLike(params: StepParams): boolean {
  return params.view === 'side' && gravityFrame(params.gravity).axis !== null;
}

/** 足元のタイルに立つ位置（重力の向きに合わせる） */
export function bodyOnTile(tile: [number, number], params: StepParams): Body {
  const box = boxFor(params.view);
  const [tx, ty] = tile;
  const b = makeBody(tx * TILE + (TILE - box.w) / 2, ty * TILE + (TILE - box.h) / 2, box.w, box.h);
  const { axis, sign } = gravityFrame(params.gravity);
  if (!sideLike(params)) {
    b.y = (ty + 1) * TILE - box.h;
  } else if (axis === 'y') {
    b.y = sign > 0 ? (ty + 1) * TILE - box.h : ty * TILE;
  } else {
    b.x = sign > 0 ? (tx + 1) * TILE - box.w : tx * TILE;
  }
  return b;
}

/** 到着したときの当たり判定。壁の中や、視点・重力が変わったときの空中に出ないようにする */
export function placeArrival(arrival: Arrival, params: StepParams, solid: SolidQuery): Body {
  const box = boxFor(params.view);
  let b: Body;
  let needSearch = false;
  let needGround = false;

  if (arrival.kind === 'edge') {
    // 当たり判定の大きさが変わっても中心は保つ
    const prev = boxFor(arrival.fromView);
    const cx = arrival.at.x + prev.w / 2;
    const cy = arrival.at.y + prev.h / 2;
    b = makeBody(cx - box.w / 2, cy - box.h / 2, box.w, box.h);
    const a = gravityFrame(arrival.fromGravity);
    const c = gravityFrame(params.gravity);
    const sameFrame = arrival.fromView === params.view && a.axis === c.axis && a.sign === c.sign;
    if (sameFrame) {
      b.vx = arrival.vel.vx;
      b.vy = arrival.vel.vy;
      needSearch = overlapsSolid(b.x, b.y, b.w, b.h, solid);
    } else {
      // 視点や重力が違うエリアの境界：一番近い安全な足場に出す
      needSearch = true;
      needGround = sideLike(params);
    }
  } else if (arrival.kind === 'tile') {
    b = bodyOnTile(arrival.tile, params);
    needSearch = true;
    needGround = sideLike(params);
  } else {
    b = makeBody(arrival.at.x, arrival.at.y, box.w, box.h);
    needSearch = overlapsSolid(b.x, b.y, b.w, b.h, solid);
  }

  if (needSearch) {
    const spot = findSafeSpot(b, solid, { needGround, gravity: params.gravity, radius: 8 });
    if (spot) {
      b.x = spot.x;
      b.y = spot.y;
    }
  }
  return b;
}

export type EdgeResult =
  | { kind: 'none' }
  /** ループする端を回り込んだ。当たり判定はもう動かしてある（カメラも同じだけずらす） */
  | { kind: 'wrapped'; dx: number; dy: number }
  /** 隣のエリアへ出た */
  | { kind: 'cross'; to: PlacedArea; arrival: Arrival };

/**
 * 当たり判定の中心がエリアの外に出たかを調べる。
 * ループする端なら回り込ませ、隣のエリアがあればそこへの到着情報を返す。
 */
export function checkEdge(body: Body, area: { def: Area; placed: PlacedArea }, params: StepParams, world: WorldMap): EdgeResult {
  const { def, placed } = area;
  const W = def.size[0] * TILE;
  const H = def.size[1] * TILE;
  let dx = 0;
  let dy = 0;
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  if (wrapsX(def.physics.wrap) && (cx < 0 || cx >= W)) dx = cx < 0 ? W : -W;
  if (wrapsY(def.physics.wrap) && (cy < 0 || cy >= H)) dy = cy < 0 ? H : -H;
  body.x += dx;
  body.y += dy;

  const ncx = body.x + body.w / 2;
  const ncy = body.y + body.h / 2;
  if (ncx >= 0 && ncy >= 0 && ncx < W && ncy < H) return dx || dy ? { kind: 'wrapped', dx, dy } : { kind: 'none' };

  const to = world.neighborAt(def.id, Math.floor(placed.x + ncx / TILE), Math.floor(placed.y + ncy / TILE));
  if (!to) return dx || dy ? { kind: 'wrapped', dx, dy } : { kind: 'none' };
  return {
    kind: 'cross',
    to,
    arrival: {
      kind: 'edge',
      at: { x: body.x + (placed.x - to.x) * TILE, y: body.y + (placed.y - to.y) * TILE },
      vel: { vx: body.vx, vy: body.vy },
      fromView: params.view,
      fromGravity: params.gravity,
    },
  };
}
