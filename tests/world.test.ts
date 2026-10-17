import { describe, expect, it } from 'vitest';
import { makeSolidQuery, shareEdge, WorldMap } from '../src/engine/world';
import { SolidMap } from '../src/engine/tilegrid';

describe('shareEdge', () => {
  it('辺が接していればつながる', () => {
    expect(shareEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 5, w: 10, h: 10 })).toBe(true);
    expect(shareEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 10, w: 3, h: 3 })).toBe(true);
  });

  it('角だけ接している・離れている・重なっている場合はつながらない', () => {
    expect(shareEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(false);
    expect(shareEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
    expect(shareEdge({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(false);
  });
});

describe('WorldMap', () => {
  const world = new WorldMap([
    { id: 'a', x: 0, y: 0, w: 10, h: 10 },
    { id: 'b', x: 10, y: -5, w: 10, h: 10 },
    { id: 'c', x: 3, y: 3, w: 4, h: 4 }, // a と重なる
  ]);

  it('隣のエリアを求める', () => {
    expect(world.neighbors('a').map((n) => n.id)).toEqual(['b']);
    expect(world.neighborAt('a', 10, 2)?.id).toBe('b');
    expect(world.neighborAt('a', 10, 7)).toBeUndefined();
  });

  it('当たり判定はエリアの外で隣のエリアのタイルを見る', () => {
    const a = SolidMap.fromAscii(Array(10).fill('..........'));
    const b = SolidMap.fromAscii([...Array(7).fill('..........'), '#.........', ...Array(2).fill('..........')]);
    const q = makeSolidQuery({ id: 'a', solid: a, wrap: 'none' }, world, (id) => (id === 'b' ? b : undefined));
    expect(q(10, 1)).toBe(false); // b の (0,6)
    expect(q(10, 2)).toBe(true); // b の (0,7) は壁
    expect(q(10, 8)).toBe(true); // 隣がない → 壁
    expect(q(-1, 0)).toBe(true);
  });

  it('ループする端は反対側を見る', () => {
    const a = SolidMap.fromAscii(['#.........', ...Array(9).fill('..........')]);
    const q = makeSolidQuery({ id: 'a', solid: a, wrap: 'horizontal' }, world, () => undefined);
    expect(q(10, 0)).toBe(true);
    expect(q(-10, 0)).toBe(true);
    expect(q(-1, 0)).toBe(false);
  });
});
