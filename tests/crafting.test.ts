import { describe, expect, it } from 'vitest';
import { canCraft, craft, materialLines, recipesAt } from '../src/systems/crafting';
import type { Slots } from '../src/systems/inventory';
import type { RecipeDef } from '../src/schema/recipes';

/** 加工（段階 C、決定 64〜68） */

const planks: RecipeDef = { id: 'planks', output: { item: 'planks', count: 2 }, inputs: [{ item: 'log', count: 2, minQuality: 1 }], station: 'workbench' };
const bench: RecipeDef = { id: 'workbench', output: { item: 'workbench', count: 1 }, inputs: [{ item: 'log', count: 1, minQuality: 1 }], station: 'hand' };
const item = (id: string) => (id === 'workbench' ? { maxStack: 1, kind: 'furniture' as const } : { maxStack: 10, kind: 'material' as const });

describe('加工', () => {
  it('作業台では手作りのレシピも使え、手作りでは手作りのレシピだけ', () => {
    expect(recipesAt([planks, bench], 'workbench').map((r) => r.id)).toEqual(['planks', 'workbench']);
    expect(recipesAt([planks, bench], 'hand').map((r) => r.id)).toEqual(['workbench']);
  });

  it('材料は手持ち → 倉庫の順に、質の低いものから使い、素材の質は使った材料の一番低い質', () => {
    const pocket: Slots = [{ item: 'log', quality: 3, count: 1 }, null];
    const storage: Slots = [{ item: 'log', quality: 2, count: 5 }];
    expect(materialLines(planks, [pocket, storage])).toEqual([{ item: 'log', need: 2, have: 6, minQuality: 1 }]);
    const r = craft(planks, [pocket, storage], [pocket, storage], item);
    expect(r).toEqual({ ok: true, quality: 2 });
    expect(pocket).toEqual([{ item: 'planks', quality: 2, count: 2 }, null]); // 材料を使って空いたマスに入る
    expect(storage).toEqual([{ item: 'log', quality: 2, count: 4 }]);
  });

  it('家具の質は 1', () => {
    const pocket: Slots = [{ item: 'log', quality: 5, count: 1 }];
    expect(craft(bench, [pocket], [pocket], item)).toEqual({ ok: true, quality: 1 });
    expect(pocket).toEqual([{ item: 'workbench', quality: 1, count: 1 }]);
  });

  it('材料が足りなければ作らない', () => {
    const pocket: Slots = [{ item: 'log', quality: 1, count: 1 }];
    expect(canCraft(planks, [pocket])).toBe(false);
    expect(craft(planks, [pocket], [pocket], item)).toEqual({ ok: false, reason: '材料が足りない' });
    expect(pocket).toEqual([{ item: 'log', quality: 1, count: 1 }]);
  });

  it('できた物が入らなければ、材料も減らさない', () => {
    const pocket: Slots = [{ item: 'log', quality: 1, count: 3 }, { item: 'rock', quality: 1, count: 1 }];
    const before = structuredClone(pocket);
    expect(craft(planks, [pocket], [pocket], item)).toEqual({ ok: false, reason: '手持ちも倉庫もいっぱい' });
    expect(pocket).toEqual(before);
  });

  it('材料を使って空いたマスに、できた物が入る', () => {
    const pocket: Slots = [{ item: 'log', quality: 1, count: 2 }];
    expect(craft(planks, [pocket], [pocket], item).ok).toBe(true);
    expect(pocket).toEqual([{ item: 'planks', quality: 1, count: 2 }]);
  });
});
