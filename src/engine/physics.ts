import { TILE } from './constants';
import type { View } from '../schema/area';

/**
 * 自作の軽量物理。Phaser に依存しない（テストできるように）。
 * 重力はベクトルで、大きい方の軸を「下」とみなす（逆さ・横向きの重力に対応）。
 */

export type SolidQuery = (tx: number, ty: number) => boolean;
export type Axis = 'x' | 'y';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  /** 足場を離れてからもジャンプを受け付ける残りステップ */
  coyote: number;
  /** 着地前に押したジャンプを覚えておく残りステップ */
  jumpBuffer: number;
}

export interface StepInput {
  /** -1〜1 */
  x: number;
  y: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export interface StepParams {
  view: View;
  gravity: [number, number];
  friction: number;
  airFriction: number;
  accel: number;
  maxSpeed: number;
  jump: number;
  maxFall: number;
}

const EPS = 1e-4;
const COYOTE_STEPS = 6;
const JUMP_BUFFER_STEPS = 6;

export function makeBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, grounded: false, coyote: 0, jumpBuffer: 0 };
}

/** 重力の「下」の軸と向き。重力がなければ axis は null */
export function gravityFrame(g: readonly [number, number]): { axis: Axis | null; sign: 1 | -1 } {
  const [gx, gy] = g;
  if (gx === 0 && gy === 0) return { axis: null, sign: 1 };
  if (Math.abs(gx) > Math.abs(gy)) return { axis: 'x', sign: gx > 0 ? 1 : -1 };
  return { axis: 'y', sign: gy > 0 ? 1 : -1 };
}

export function overlapsSolid(x: number, y: number, w: number, h: number, solid: SolidQuery): boolean {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - EPS) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - EPS) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (solid(tx, ty)) return true;
    }
  }
  return false;
}

function moveOnce(b: Body, axis: Axis, d: number, solid: SolidQuery): boolean {
  if (d === 0) return false;
  if (axis === 'x') {
    b.x += d;
    const y0 = Math.floor(b.y / TILE);
    const y1 = Math.floor((b.y + b.h - EPS) / TILE);
    const tx = d > 0 ? Math.floor((b.x + b.w - EPS) / TILE) : Math.floor(b.x / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      if (solid(tx, ty)) {
        b.x = d > 0 ? tx * TILE - b.w : (tx + 1) * TILE;
        return true;
      }
    }
  } else {
    b.y += d;
    const x0 = Math.floor(b.x / TILE);
    const x1 = Math.floor((b.x + b.w - EPS) / TILE);
    const ty = d > 0 ? Math.floor((b.y + b.h - EPS) / TILE) : Math.floor(b.y / TILE);
    for (let tx = x0; tx <= x1; tx++) {
      if (solid(tx, ty)) {
        b.y = d > 0 ? ty * TILE - b.h : (ty + 1) * TILE;
        return true;
      }
    }
  }
  return false;
}

/** 軸に沿って動かす。ぶつかった向き（-1 / 1）、ぶつからなければ 0 */
export function moveAxis(b: Body, axis: Axis, delta: number, solid: SolidQuery): -1 | 0 | 1 {
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / (TILE / 2)));
  const d = delta / steps;
  for (let i = 0; i < steps; i++) {
    if (moveOnce(b, axis, d, solid)) return d > 0 ? 1 : -1;
  }
  return 0;
}

function getV(b: Body, axis: Axis): number {
  return axis === 'x' ? b.vx : b.vy;
}

function setV(b: Body, axis: Axis, v: number): void {
  if (axis === 'x') b.vx = v;
  else b.vy = v;
}

/** 1ステップ進める */
export function stepBody(b: Body, input: StepInput, p: StepParams, solid: SolidQuery): void {
  const frame = gravityFrame(p.gravity);
  if (p.view === 'top' || frame.axis === null) {
    stepFree(b, input, p, solid);
    return;
  }

  const down = frame.axis;
  const lat: Axis = down === 'y' ? 'x' : 'y';
  const s = frame.sign;
  // 横向きの重力では上下キーが「左右」になる
  const latInput = down === 'y' ? input.x : input.y;

  let vLat = getV(b, lat);
  let vDown = getV(b, down);
  const fr = b.grounded ? p.friction : p.airFriction;

  if (latInput !== 0) {
    if (vLat !== 0 && Math.sign(vLat) !== Math.sign(latInput)) vLat *= fr;
    vLat += latInput * p.accel * (b.grounded ? 1 : 0.8);
    vLat = Math.max(-p.maxSpeed, Math.min(p.maxSpeed, vLat));
  } else {
    vLat *= fr;
    if (Math.abs(vLat) < 0.01) vLat = 0;
  }

  b.jumpBuffer = input.jumpPressed ? JUMP_BUFFER_STEPS : Math.max(0, b.jumpBuffer - 1);
  b.coyote = b.grounded ? COYOTE_STEPS : Math.max(0, b.coyote - 1);
  if (b.jumpBuffer > 0 && b.coyote > 0 && p.jump > 0) {
    vDown = -s * p.jump;
    b.jumpBuffer = 0;
    b.coyote = 0;
  }

  const g = Math.abs(down === 'y' ? p.gravity[1] : p.gravity[0]);
  const rising = vDown * s < 0;
  // ボタンを離すと上昇が早く終わる（ジャンプの高さを調節できる）
  vDown += s * g * (rising && !input.jumpHeld ? 2 : 1);
  if (vDown * s > p.maxFall) vDown = s * p.maxFall;

  if (moveAxis(b, lat, vLat, solid) !== 0) vLat = 0;
  const hit = moveAxis(b, down, vDown, solid);
  b.grounded = hit === s;
  if (hit !== 0) vDown = 0;

  setV(b, lat, vLat);
  setV(b, down, vDown);
}

/** 見下ろし・無重力の移動 */
function stepFree(b: Body, input: StepInput, p: StepParams, solid: SolidQuery): void {
  let ix = input.x;
  let iy = input.y;
  const len = Math.hypot(ix, iy);
  if (len > 1) {
    ix /= len;
    iy /= len;
  }
  if (ix === 0) b.vx *= p.friction;
  if (iy === 0) b.vy *= p.friction;
  b.vx += ix * p.accel;
  b.vy += iy * p.accel;
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > p.maxSpeed) {
    b.vx = (b.vx / speed) * p.maxSpeed;
    b.vy = (b.vy / speed) * p.maxSpeed;
  }
  if (Math.abs(b.vx) < 0.01) b.vx = 0;
  if (Math.abs(b.vy) < 0.01) b.vy = 0;

  if (moveAxis(b, 'x', b.vx, solid) !== 0) b.vx = 0;
  if (moveAxis(b, 'y', b.vy, solid) !== 0) b.vy = 0;
  b.grounded = false;
  b.coyote = 0;
  b.jumpBuffer = 0;
}

/** 重力の向きに少し動かすと固体に当たるか（足場があるか） */
export function hasGroundBelow(
  x: number,
  y: number,
  w: number,
  h: number,
  gravity: readonly [number, number],
  solid: SolidQuery,
  maxDistance: number,
): boolean {
  const { axis, sign } = gravityFrame(gravity);
  if (axis === null) return true;
  for (let d = 1; d <= maxDistance; d += 2) {
    const ox = axis === 'x' ? sign * d : 0;
    const oy = axis === 'y' ? sign * d : 0;
    if (overlapsSolid(x + ox, y + oy, w, h, solid)) return true;
  }
  return false;
}

/**
 * 安全な出現位置を探す（視点や重力が違うエリアに入ったとき、空中や壁の中に出ないように）。
 * 元の位置から近い順にタイル単位でずらして試す。見つからなければ null。
 */
export function findSafeSpot(
  b: Pick<Body, 'x' | 'y' | 'w' | 'h'>,
  solid: SolidQuery,
  opts: { needGround: boolean; gravity: readonly [number, number]; radius: number },
): { x: number; y: number } | null {
  const free = (x: number, y: number) => !overlapsSolid(x, y, b.w, b.h, solid);
  const grounded = (x: number, y: number) =>
    !opts.needGround || hasGroundBelow(x, y, b.w, b.h, opts.gravity, solid, TILE * 3);

  let firstFree: { x: number; y: number } | null = null;
  for (let r = 0; r <= opts.radius; r++) {
    const ring: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
      }
    }
    ring.sort((a, c) => Math.hypot(a[0], a[1]) - Math.hypot(c[0], c[1]));
    for (const [dx, dy] of ring) {
      const x = b.x + dx * TILE;
      const y = b.y + dy * TILE;
      if (!free(x, y)) continue;
      firstFree ??= { x, y };
      if (grounded(x, y)) return { x, y };
    }
  }
  return firstFree;
}
