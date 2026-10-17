import { describe, expect, it } from 'vitest';
import { findSafeSpot, makeBody, overlapsSolid, stepBody, type StepInput, type StepParams } from '../src/engine/physics';
import { SolidMap } from '../src/engine/tilegrid';
import { TILE } from '../src/engine/constants';

const side: StepParams = {
  view: 'side',
  gravity: [0, 0.3],
  friction: 0.8,
  airFriction: 0.95,
  accel: 0.25,
  maxSpeed: 2,
  jump: 5.2,
  maxFall: 7,
};
const idle: StepInput = { x: 0, y: 0, jumpPressed: false, jumpHeld: false };

function run(rows: string[], body: ReturnType<typeof makeBody>, params: StepParams, inputs: (i: number) => StepInput, steps: number) {
  const map = SolidMap.fromAscii(rows);
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= map.w || y >= map.h || map.isSolid(x, y);
  for (let i = 0; i < steps; i++) stepBody(body, inputs(i), params, solid);
  return solid;
}

const room = [
  '########',
  '#......#',
  '#......#',
  '#......#',
  '#......#',
  '########',
];

describe('横視点', () => {
  it('落ちて床に着地する', () => {
    const b = makeBody(TILE * 2, TILE, 10, 20);
    run(room, b, side, () => idle, 120);
    expect(b.grounded).toBe(true);
    expect(b.y + b.h).toBe(TILE * 5);
  });

  it('ジャンプして約3タイル以内の高さに上がり、また着地する', () => {
    const b = makeBody(TILE * 2, TILE * 5 - 20, 10, 20);
    const map = SolidMap.fromAscii(['..........', '..........', '..........', '..........', '..........', '##########']);
    const solid = (x: number, y: number) => y >= map.h || map.isSolid(x, y);
    stepBody(b, idle, side, solid);
    const floorY = b.y;
    let top = b.y;
    for (let i = 0; i < 90; i++) {
      stepBody(b, { ...idle, jumpPressed: i === 0, jumpHeld: true }, side, solid);
      top = Math.min(top, b.y);
    }
    const height = floorY - top;
    expect(height).toBeGreaterThan(TILE * 2);
    expect(height).toBeLessThan(TILE * 3.2);
    expect(b.grounded).toBe(true);
  });

  it('上向きの重力では天井に「着地」する', () => {
    const b = makeBody(TILE * 2, TILE * 3, 10, 20);
    run(room, b, { ...side, gravity: [0, -0.3] }, () => idle, 120);
    expect(b.grounded).toBe(true);
    expect(b.y).toBe(TILE);
  });

  it('壁を通り抜けない', () => {
    const b = makeBody(TILE * 2, TILE * 4 - 20, 10, 20);
    run(room, b, side, () => ({ ...idle, x: 1 }), 200);
    expect(b.x + b.w).toBe(TILE * 7);
  });
});

describe('見下ろし', () => {
  it('斜め移動でも最高速度を超えず、壁で止まる', () => {
    const b = makeBody(TILE * 2, TILE * 2, 10, 8);
    const params: StepParams = { ...side, view: 'top' };
    const map = SolidMap.fromAscii(room);
    const solid = (x: number, y: number) => map.isSolid(x, y);
    for (let i = 0; i < 10; i++) {
      stepBody(b, { ...idle, x: 1, y: 1 }, params, solid);
      expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(params.maxSpeed + 1e-9);
    }
    for (let i = 0; i < 200; i++) stepBody(b, { ...idle, x: 1, y: 1 }, params, solid);
    expect(b.x + b.w).toBe(TILE * 7);
    expect(b.y + b.h).toBe(TILE * 5);
    expect(overlapsSolid(b.x, b.y, b.w, b.h, solid)).toBe(false);
  });
});

describe('findSafeSpot', () => {
  it('壁の中なら近くの空いた場所、横視点なら足場のある場所を返す', () => {
    const map = SolidMap.fromAscii([
      '########',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '########',
    ]);
    const solid = (x: number, y: number) => map.isSolid(x, y);
    const spot = findSafeSpot({ x: 0, y: TILE * 2, w: 10, h: 20 }, solid, { needGround: true, gravity: [0, 0.3], radius: 4 });
    expect(spot).not.toBeNull();
    expect(overlapsSolid(spot!.x, spot!.y, 10, 20, solid)).toBe(false);
  });
});
