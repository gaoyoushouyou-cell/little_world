import type { BaseDef, Economy } from '../schema/economy';
import { addItem, canPay, emptySlots, pay, resize, type CostLine, type Slots } from './inventory';
import { CORRIDOR, type SaveData } from './save';

/**
 * 拠点。起点のベッドの部屋は拠点0（initial）で、最初から段階1。
 * 段階2以上の拠点は「夢の回廊」で倉庫を共有する。
 */

export function stageOf(save: SaveData, area: string): number {
  return save.bases[area] ?? 0;
}

/** 最初から持っている拠点を入れる（新しいセーブや、拠点の設定が増えたとき） */
export function ensureInitialBases(save: SaveData, defs: BaseDef[]): void {
  for (const d of defs) if (d.initial && !save.bases[d.area]) save.bases[d.area] = 1;
}

/** 最初の持ち物（economy.starter）を、最初の拠点の倉庫に 1 回だけ入れる（決定 62） */
export function grantStarter(save: SaveData, defs: BaseDef[], economy: Economy, maxStack: (item: string) => number): void {
  if (save.granted.includes('starter') || economy.starter.length === 0) return;
  const home = defs.find((d) => d.initial);
  if (!home) return;
  const storage = storageOf(save, home.area, economy);
  for (const s of economy.starter) addItem(storage, s.item, 1, s.count, maxStack(s.item));
  save.granted.push('starter');
}

/** initial でない拠点をいくつ持っているか */
export function ownedExtraBases(save: SaveData, defs: BaseDef[]): number {
  return defs.filter((d) => !d.initial && stageOf(save, d.area) > 0).length;
}

/**
 * 次の段階に上げる費用。拠点にするとき（段階1）は、すでに持っている拠点の数で重くなり、
 * 必要な質も上がる（n 個目の拠点：量 × 成長率^(n-1)、質 ≥ n）。
 */
export function nextStageCost(def: BaseDef, save: SaveData, defs: BaseDef[], economy: Economy): { stage: number; cost: CostLine[] } | null {
  const target = stageOf(save, def.area) + 1;
  const stage = def.stages.find((s) => s.stage === target);
  if (!stage) return null;
  if (target > 1) return { stage: target, cost: stage.cost.map((c) => ({ ...c })) };
  const n = ownedExtraBases(save, defs) + 1;
  const scale = economy.baseCostGrowth ** (n - 1);
  return {
    stage: target,
    cost: stage.cost.map((c) => ({ item: c.item, count: Math.ceil(c.count * scale), minQuality: Math.max(c.minQuality, n) })),
  };
}

/** この拠点の倉庫の名前（段階2以上は夢の回廊） */
export function storageKey(save: SaveData, area: string): string {
  return stageOf(save, area) >= 2 ? CORRIDOR : area;
}

/** 倉庫のマス数。夢の回廊はつながった拠点の分を合わせる */
export function storageCapacity(save: SaveData, key: string, economy: Economy): number {
  const slotsFor = (stage: number) => economy.storageSlots[Math.min(stage, economy.storageSlots.length) - 1] ?? 0;
  if (key !== CORRIDOR) return slotsFor(stageOf(save, key));
  return Object.values(save.bases)
    .filter((s) => s >= 2)
    .reduce((n, s) => n + slotsFor(s), 0);
}

/** 倉庫を取り出す（なければ作り、マス数を段階に合わせる） */
export function storageOf(save: SaveData, area: string, economy: Economy): Slots {
  const key = storageKey(save, area);
  const cap = storageCapacity(save, key, economy);
  save.storage[key] = resize(save.storage[key] ?? emptySlots(cap), cap);
  return save.storage[key]!;
}

/** 段階を上げる。払えなければ false */
export function upgrade(def: BaseDef, save: SaveData, defs: BaseDef[], economy: Economy, sources: Slots[]): boolean {
  const next = nextStageCost(def, save, defs, economy);
  if (!next || !canPay(sources, next.cost)) return false;
  pay(sources, next.cost);
  const before = storageKey(save, def.area);
  save.bases[def.area] = next.stage;
  // 段階2になったら、拠点の倉庫の中身を夢の回廊へ移す
  if (before !== storageKey(save, def.area)) {
    const own = save.storage[before] ?? [];
    delete save.storage[before];
    const corridor = storageOf(save, def.area, economy);
    for (const s of own) {
      if (!s) continue;
      const i = corridor.indexOf(null);
      if (i >= 0) corridor[i] = s;
    }
  } else {
    storageOf(save, def.area, economy);
  }
  return true;
}

/** 拠点どうしで移動できる行き先（段階2以上の、今いる所以外） */
export function warpTargets(save: SaveData, defs: BaseDef[], here: string): BaseDef[] {
  return defs.filter((d) => d.area !== here && stageOf(save, d.area) >= 2);
}
