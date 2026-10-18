import { describe, expect, it } from 'vitest';
import { SolidMap } from '../src/engine/tilegrid';
import { composeObjects, composeSolid, contentKey, footprint, placementProblem, reachableCount, type PlacementQuery, type Tile } from '../src/systems/building';
import { quickStack, sortSlots, splitHalf, totalWeight, type Slots } from '../src/systems/inventory';
import { migrate, newSave, SAVE_VERSION } from '../src/systems/save';
import { grantStarter, storageOf } from '../src/systems/bases';
import type { LoadedArea, PlacedObject } from '../src/engine/content';

/** 建築モード（決定 51〜58）の判定と、持ち物の強化、セーブの版 2 */

const room = SolidMap.fromAscii([
  '#######',
  '#.....#',
  '#.....#',
  '###.###', // 1 マス幅の通り道
  '#.....#',
  '#######',
]);

const query = (cells: Tile[], extra: Partial<PlacementQuery> = {}): PlacementQuery => ({
  tileSolid: room,
  others: [],
  candidate: { cells, footprint: cells },
  blocked: [],
  starts: [[1, 1]],
  targets: [[1, 4]],
  player: [],
  ...extra,
});

describe('置けるかどうか', () => {
  it('空いている床には置ける', () => {
    expect(placementProblem(query([[2, 1]]))).toBeNull();
  });

  it('壁・エリアの外・ほかの物・出入口・自分と重なると置けない', () => {
    expect(placementProblem(query([[0, 1]]))).toBe('壁と重なる');
    expect(placementProblem(query([[9, 1]]))).toBe('エリアの外にはみ出す');
    expect(placementProblem(query([[2, 1]], { others: [{ cells: [], footprint: [[2, 1]] }] }))).toBe('ほかの物と重なる');
    expect(placementProblem(query([[2, 1]], { blocked: [[2, 1]] }))).toBe('出入口の上には置けない');
    expect(placementProblem(query([[2, 1]], { player: [[2, 1]] }))).toBe('自分と重なる');
  });

  it('出入口への道をふさぐマスには置けない', () => {
    expect(placementProblem(query([[3, 3]]))).toBe('出入口への道をふさぐ');
    expect(placementProblem(query([[3, 2]]))).toBe('出入口への道をふさぐ');
    expect(placementProblem(query([[5, 2]]))).toBeNull();
  });

  it('当たり判定のない飾りは道をふさがない（ほかの物とは重ねられない）', () => {
    expect(placementProblem({ ...query([]), candidate: { cells: [], footprint: [[3, 3]] } })).toBeNull();
  });

  it('歩いて行けるマスを数える', () => {
    expect(reachableCount(room, [[1, 1]], [[1, 4], [5, 2]])).toBe(2);
    expect(reachableCount(composeSolid(room, [[[3, 3]]]), [[1, 1]], [[1, 4], [5, 2]])).toBe(1);
  });

  it('当たり判定のない物は、足元の列を床として占める', () => {
    expect(footprint([2, 5], [], 40)).toEqual([[2, 5], [3, 5], [4, 5]]);
    expect(footprint([2, 5], [[2, 5], [2, 4]], 40)).toEqual([[2, 5], [2, 4]]);
  });
});

describe('原本の物と上書き層を重ねる', () => {
  const obj = (id: string, at: Tile): PlacedObject => ({
    placement: { object: id, at, offset: [0, 0], flipX: false, front: false },
    def: { id, sprite: id, animation: 'idle', collision: { top: [1, 1] }, provisional: false, movable: true },
    layout: { cells: [at], anchorX: 0, anchorY: 0, angle: 0 },
  });
  const area = { objects: [obj('chair', [1, 1]), obj('lamp', [2, 2])] } as unknown as LoadedArea;

  it('しまった原本の物を除き、置いた物を足す', () => {
    const list = composeObjects(area, [{ object: 'bed', at: [4, 1], flipX: true }], [contentKey({ object: 'chair', at: [1, 1] })], (rec) => obj(rec.object, rec.at));
    expect(list.map((o) => [o.def.id, o.source.kind])).toEqual([
      ['lamp', 'content'],
      ['bed', 'placed'],
    ]);
  });
});

describe('持ち物の強化', () => {
  const max = (item: string) => (item === 'bed' ? 1 : 10);
  const order = (item: string) => ({ rock: 0, log: 1, bed: 100 })[item] ?? 50;

  it('並べ替えると、同じ物・同じ質はまとまり、種類の順・質の高い順に並ぶ', () => {
    const slots: Slots = [{ item: 'bed', quality: 1, count: 1 }, null, { item: 'log', quality: 1, count: 4 }, { item: 'rock', quality: 2, count: 3 }, { item: 'log', quality: 1, count: 8 }, { item: 'rock', quality: 3, count: 1 }];
    sortSlots(slots, order, max);
    expect(slots).toEqual([
      { item: 'rock', quality: 3, count: 1 },
      { item: 'rock', quality: 2, count: 3 },
      { item: 'log', quality: 1, count: 10 },
      { item: 'log', quality: 1, count: 2 },
      { item: 'bed', quality: 1, count: 1 },
      null,
    ]);
  });

  it('半分に分ける（空きがなければ分けない）', () => {
    const slots: Slots = [{ item: 'log', quality: 1, count: 5 }, null];
    expect(splitHalf(slots, 0)).toBe(true);
    expect(slots).toEqual([{ item: 'log', quality: 1, count: 3 }, { item: 'log', quality: 1, count: 2 }]);
    expect(splitHalf(slots, 0)).toBe(false);
  });

  it('同じ物だけを倉庫へまとめて入れる', () => {
    const pocket: Slots = [{ item: 'log', quality: 1, count: 3 }, { item: 'rock', quality: 1, count: 2 }, { item: 'log', quality: 2, count: 1 }];
    const storage: Slots = [{ item: 'log', quality: 1, count: 1 }, null, null];
    expect(quickStack(pocket, storage, max)).toBe(3);
    expect(pocket).toEqual([null, { item: 'rock', quality: 1, count: 2 }, { item: 'log', quality: 2, count: 1 }]);
    expect(storage[0]).toEqual({ item: 'log', quality: 1, count: 4 });
  });

  it('重さの合計', () => {
    expect(totalWeight([{ item: 'rock', quality: 1, count: 3 }, null, { item: 'bed', quality: 1, count: 1 }], (i) => (i === 'rock' ? 2 : 0))).toBe(6);
  });
});

describe('置ける箱（段階 B）', () => {
  const economy = { pocketSlots: 12, storageSlots: [24], baseCostGrowth: 1.6, starter: [{ item: 'chest_small', count: 2 }] };
  const defs = [{ area: 'home', initial: true, spawn: 's', stages: [] }];

  it('最初の持ち物は、最初の拠点の倉庫に 1 回だけ入る', () => {
    const save = newSave(12);
    save.bases.home = 1;
    grantStarter(save, defs, economy, () => 1);
    grantStarter(save, defs, economy, () => 1);
    expect(storageOf(save, 'home', economy).filter(Boolean)).toEqual([
      { item: 'chest_small', quality: 1, count: 1 },
      { item: 'chest_small', quality: 1, count: 1 },
    ]);
    expect(save.granted).toEqual(['starter']);
  });

  it('版 2 のセーブにも、配った記録がない状態で移行する（次に入ったときに配られる）', () => {
    const data = migrate({ version: 2, placed: { home: [{ object: 'chest_small', at: [1, 1], flipX: false }] }, hidden: {} }, 12);
    expect(data.version).toBe(3);
    expect(data.granted).toEqual([]);
    expect(data.placed.home).toHaveLength(1);
  });
});

describe('セーブの版 2', () => {
  it('版 1 のセーブに上書き層を足す（中身は残す）', () => {
    const v1 = { version: 1, visited: ['bed_room'], usedWarps: [], bases: { bed_room: 1 }, pocket: [], storage: {}, respawn: { area: 'bed_room', spawn: 'start' }, visits: {} };
    const data = migrate(v1, 12);
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.placed).toEqual({});
    expect(data.hidden).toEqual({});
    expect(data.visited).toEqual(['bed_room']);
    expect(data.pocket).toHaveLength(12);
  });

  it('置いたベッドで眠った場所（マス）も持てる', () => {
    const data = migrate({ version: 2, respawn: { area: 'bed_room', tile: [4, 5] }, placed: { bed_room: [{ object: 'bed_pink', at: [4, 5], flipX: false }] }, hidden: {} }, 12);
    expect(data.respawn).toEqual({ area: 'bed_room', tile: [4, 5] });
    expect(data.placed.bed_room).toHaveLength(1);
  });
});
