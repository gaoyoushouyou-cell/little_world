import { describe, expect, it } from 'vitest';
import { addItem, countItem, emptySlots, moveAll, pay, removeItem } from '../src/systems/inventory';
import { nextStageCost, storageOf, upgrade, warpTargets } from '../src/systems/bases';
import { CORRIDOR, migrate, newSave, SaveStore } from '../src/systems/save';
import { scatterPickups } from '../src/systems/gather';
import { buildMosaic } from '../src/systems/mapview';
import { SolidMap, TileGrid } from '../src/engine/tilegrid';
import type { BaseDef, Economy } from '../src/schema/economy';

describe('持ち物', () => {
  it('同じ素材・同じ質は重ね、質が違えば別のマス。入りきらない数を返す', () => {
    const s = emptySlots(2);
    expect(addItem(s, 'log', 1, 150, 99)).toBe(0);
    expect(s).toEqual([{ item: 'log', quality: 1, count: 99 }, { item: 'log', quality: 1, count: 51 }]);
    expect(addItem(s, 'log', 2, 1, 99)).toBe(1);
  });

  it('取り出すときは質の低いものから使い、質の条件を守る', () => {
    const s = emptySlots(3);
    addItem(s, 'rock', 3, 2, 99);
    addItem(s, 'rock', 1, 2, 99);
    expect(countItem(s, 'rock', 2)).toBe(2);
    expect(removeItem(s, 'rock', 3)).toBe(true);
    expect(countItem(s, 'rock')).toBe(1);
    expect(s.find((x) => x)?.quality).toBe(3);
    expect(removeItem(s, 'rock', 5)).toBe(false);
  });

  it('複数の入れ物から費用を払い、足りなければ何も減らさない', () => {
    const a = emptySlots(2);
    const b = emptySlots(2);
    addItem(a, 'log', 1, 3, 99);
    addItem(b, 'log', 1, 4, 99);
    expect(pay([a, b], [{ item: 'log', count: 10, minQuality: 1 }])).toBe(false);
    expect(countItem(a, 'log') + countItem(b, 'log')).toBe(7);
    expect(pay([a, b], [{ item: 'log', count: 5, minQuality: 1 }])).toBe(true);
    expect(countItem(a, 'log')).toBe(0);
    expect(countItem(b, 'log')).toBe(2);
  });

  it('全部しまう', () => {
    const pocket = emptySlots(3);
    const box = emptySlots(4);
    addItem(pocket, 'sap', 1, 5, 99);
    addItem(pocket, 'clay', 1, 2, 99);
    expect(moveAll(pocket, box, () => 99)).toBe(7);
    expect(pocket.every((x) => x === null)).toBe(true);
  });
});

const economy: Economy = { pocketSlots: 12, storageSlots: [24, 36], baseCostGrowth: 2, starter: [] };
const home: BaseDef = { area: 'home', initial: true, spawn: 's', stages: [{ stage: 2, cost: [{ item: 'log', count: 2, minQuality: 1 }] }] };
const far: BaseDef = {
  area: 'far',
  initial: false,
  spawn: 's',
  stages: [
    { stage: 1, cost: [{ item: 'log', count: 3, minQuality: 1 }] },
    { stage: 2, cost: [{ item: 'log', count: 1, minQuality: 1 }] },
  ],
};
const far2: BaseDef = { ...far, area: 'far2' };

describe('拠点', () => {
  it('n 個目の拠点ほど量が増え、必要な質も上がる', () => {
    const save = newSave(12);
    save.bases.home = 1;
    expect(nextStageCost(far, save, [home, far, far2], economy)?.cost).toEqual([{ item: 'log', count: 3, minQuality: 1 }]);
    save.bases.far = 1;
    expect(nextStageCost(far2, save, [home, far, far2], economy)?.cost).toEqual([{ item: 'log', count: 6, minQuality: 2 }]);
  });

  it('段階2で倉庫が夢の回廊に移り、段階2どうしで移動できる', () => {
    const save = newSave(12);
    save.bases.home = 1;
    save.bases.far = 1;
    addItem(storageOf(save, 'home', economy), 'sap', 1, 3, 99);
    addItem(save.pocket, 'log', 1, 5, 99);
    expect(upgrade(home, save, [home, far], economy, [save.pocket])).toBe(true);
    expect(save.storage.home).toBeUndefined();
    expect(countItem(save.storage[CORRIDOR]!, 'sap')).toBe(3);
    expect(warpTargets(save, [home, far], 'home')).toEqual([]);
    expect(upgrade(far, save, [home, far], economy, [save.pocket])).toBe(true);
    expect(warpTargets(save, [home, far], 'home').map((b) => b.area)).toEqual(['far']);
    expect(storageOf(save, 'far', economy).length).toBe(72);
  });
});

describe('セーブ', () => {
  it('壊れたデータや古い形でも新しい形に直して読める', () => {
    expect(migrate('broken', 12).pocket.length).toBe(12);
    const old = migrate({ version: 1, visited: ['a'], pocket: [null] }, 12);
    expect(old.visited).toEqual(['a']);
    expect(old.pocket.length).toBe(12);
  });

  it('保存して読み直せる', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const a = new SaveStore(storage, 12);
    a.markVisited('bed_room');
    a.markWarp('w1');
    a.save();
    const b = new SaveStore(storage, 12);
    expect(b.data.visited).toEqual(['bed_room']);
    expect(b.data.usedWarps).toEqual(['w1']);
    expect(b.data.visits.bed_room).toBe(1);
  });
});

describe('揺らぎ区域の素材', () => {
  const solid = SolidMap.fromAscii(['#....', '.....', '.....']);
  const gather = { count: [3, 3] as [number, number], items: [{ item: 'log', weight: 1 }] };
  it('入った回数が同じなら同じ並び、違えば別の並び。壁と避ける場所には置かない', () => {
    const opts = { areaId: 'f', depth: 2, solid, avoid: (x: number) => x === 4 };
    const a = scatterPickups(gather, { ...opts, visit: 1 });
    expect(scatterPickups(gather, { ...opts, visit: 1 })).toEqual(a);
    expect(scatterPickups(gather, { ...opts, visit: 2 })).not.toEqual(a);
    expect(a).toHaveLength(3);
    for (const p of a) {
      expect(p.quality).toBe(2);
      expect(p.tile).not.toEqual([0, 0]);
      expect(p.tile[0]).not.toBe(4);
    }
  });
});

describe('地図のモザイク', () => {
  it('4×4 マスごとに一番多い色、上のレイヤーが優先、何もなければ null', () => {
    const floor = TileGrid.fromRows(['aaaaaa', 'aaaaaa', 'aaaaaa', 'aaaaaa'], { a: 'grass', '.': null });
    const top = TileGrid.fromRows(['bbb...', 'bbb...', 'b.....', '......'], { b: 'stone', '.': null });
    const empty = TileGrid.fromRows(['......', '......', '......', '......'], { '.': null });
    const color = (t: string) => ({ grass: '#00ff00', stone: '#888888' })[t];
    const m = buildMosaic([floor, top], color, 6, 4);
    expect(m.w).toBe(2);
    expect(m.cells).toEqual(['#00ff00', '#00ff00']);
    const m2 = buildMosaic([floor, top], color, 4, 4);
    expect(m2.cells).toEqual(['#00ff00']);
    expect(buildMosaic([empty], color, 6, 4).cells).toEqual([null, null]);
    const dense = TileGrid.fromRows(['bbbb', 'bbbb', 'bbbb', 'aaaa'], { a: 'grass', b: 'stone' });
    expect(buildMosaic([dense], color, 4, 4).cells).toEqual(['#888888']);
  });
});
