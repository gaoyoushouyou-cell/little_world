import type { RecipeDef, Station } from '../schema/recipes';
import { addItem, countItem, type Slots } from './inventory';

/**
 * 加工（段階 C、決定 64〜68）。Phaser に依存しない。
 * 材料は sources の前の入れ物から順に、質の低いものから使う。
 * できた物は outputs の前の入れ物から順に入れ、入らなければ何も変えない。
 */

export interface MaterialLine {
  item: string;
  need: number;
  have: number;
  minQuality: number;
}

/** その場所で使えるレシピ（作業台では手作りのレシピも使える） */
export function recipesAt(recipes: Iterable<RecipeDef>, station: Station): RecipeDef[] {
  return [...recipes].filter((r) => r.station === 'hand' || r.station === station);
}

export function materialLines(recipe: RecipeDef, sources: readonly Slots[]): MaterialLine[] {
  return recipe.inputs.map((c) => ({
    item: c.item,
    need: c.count,
    have: sources.reduce((n, s) => n + countItem(s, c.item, c.minQuality), 0),
    minQuality: c.minQuality,
  }));
}

export function canCraft(recipe: RecipeDef, sources: readonly Slots[]): boolean {
  return materialLines(recipe, sources).every((l) => l.have >= l.need);
}

/** 材料を使い、使ったうち一番低い質を返す（足りなければ null。そのときは途中まで使っているので、複製で呼ぶ） */
function consume(sources: Slots[], item: string, count: number, minQuality: number): number | null {
  let left = count;
  let lowest = Infinity;
  for (const slots of sources) {
    const order = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s && s.item === item && s.quality >= minQuality)
      .sort((a, b) => a.s!.quality - b.s!.quality);
    for (const { s, i } of order) {
      if (left === 0) break;
      const n = Math.min(left, s!.count);
      s!.count -= n;
      left -= n;
      lowest = Math.min(lowest, s!.quality);
      if (s!.count === 0) slots[i] = null;
    }
    if (left === 0) break;
  }
  return left === 0 ? lowest : null;
}

export type CraftResult = { ok: true; quality: number } | { ok: false; reason: string };

/**
 * 作る。sources と outputs には同じ入れ物（手持ちなど）が入っていてもよい。
 * 質：素材は使った材料のうち一番低い質、家具（furniture）は 1
 */
export function craft(
  recipe: RecipeDef,
  sources: Slots[],
  outputs: Slots[],
  item: (id: string) => { maxStack: number; kind: 'material' | 'furniture' } | undefined,
): CraftResult {
  if (!canCraft(recipe, sources)) return { ok: false, reason: '材料が足りない' };
  const out = item(recipe.output.item);
  if (!out) return { ok: false, reason: 'できる物が定義されていない' };

  const run = (src: Slots[], dst: Slots[]): CraftResult => {
    let lowest = Infinity;
    for (const c of recipe.inputs) {
      const q = consume(src, c.item, c.count, c.minQuality);
      if (q === null) return { ok: false, reason: '材料が足りない' };
      lowest = Math.min(lowest, q);
    }
    const quality = out.kind === 'furniture' || !Number.isFinite(lowest) ? 1 : lowest;
    let left = recipe.output.count;
    for (const slots of dst) {
      left = addItem(slots, recipe.output.item, quality, left, out.maxStack);
      if (left === 0) break;
    }
    return left === 0 ? { ok: true, quality } : { ok: false, reason: '手持ちも倉庫もいっぱい' };
  };

  // 複製で試し、うまくいくときだけ本物で行う（同じ入れ物が両方にあっても、同じ複製を使う）
  const copies = new Map<Slots, Slots>();
  const copy = (s: Slots) => copies.get(s) ?? copies.set(s, structuredClone(s)).get(s)!;
  const trial = run(sources.map(copy), outputs.map(copy));
  if (!trial.ok) return trial;
  return run(sources, outputs);
}
