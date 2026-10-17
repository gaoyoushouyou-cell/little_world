import { describe, expect, it } from 'vitest';
import { layoutObject } from '../src/engine/objects';
import { TILE } from '../src/engine/constants';

const at = (x: number, y: number) => ({ at: [x, y] as [number, number], offset: [0, 0] as [number, number] });

describe('layoutObject', () => {
  it('見下ろし：足元のマスから奥へ当たり判定が伸び、絵は足元の下端中央に立つ', () => {
    const l = layoutObject(at(2, 11), { collision: { top: [1, 2] } }, 16, 'top', [0, 0]);
    expect(l.cells).toEqual([[2, 11], [2, 10]]);
    expect([l.anchorX, l.anchorY, l.angle]).toEqual([2.5 * TILE, 12 * TILE, 0]);
  });

  it('横視点・上向きの重力：天井から逆さに立ち、当たり判定は下へ伸びる', () => {
    const l = layoutObject(at(5, 4), { collision: { side: [2, 3] } }, 32, 'side', [0, -0.3]);
    expect(l.cells).toEqual([[5, 4], [5, 5], [5, 6], [6, 4], [6, 5], [6, 6]]);
    expect([l.anchorX, l.anchorY, l.angle]).toEqual([6 * TILE, 4 * TILE, 180]);
  });

  it('当たり判定がない物は、絵の幅のマスで中央をそろえる', () => {
    const l = layoutObject(at(10, 23), { collision: {} }, 31, 'side', [0, 0.3]);
    expect(l.cells).toEqual([]);
    expect(l.anchorX).toBe(11 * TILE);
  });
});
