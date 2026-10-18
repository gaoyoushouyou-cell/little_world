import { z } from 'zod';
import { Id } from './common';

/** 素材・通貨などの持ち物。content/items/<id>.json */
export const ItemDef = z.strictObject({
  id: Id,
  name: z.string(),
  /** アイコンのスプライト（16×16） */
  icon: Id,
  /** 沈み（深い夢に潜るための重さ）に効く。段階5で使う */
  weight: z.number().min(0).default(1),
  maxStack: z.number().int().positive().default(99),
  /** material = 素材、furniture = 拠点に置ける家具（決定 51：重さ 0、1 マスに 1 つ） */
  kind: z.enum(['material', 'furniture']).default('material'),
  /** furniture のとき、置く物（content/objects/<id>.json） */
  places: Id.optional(),
  note: z.string().optional(),
});
export type ItemDef = z.infer<typeof ItemDef>;

export const Cost = z.array(
  z.strictObject({
    item: Id,
    count: z.number().int().positive(),
    /** これ以上の質の素材だけが使える */
    minQuality: z.number().int().min(1).max(7).default(1),
  }),
);
export type Cost = z.infer<typeof Cost>;

/** 拠点にできるエリアの設定。content/bases/<area>.json */
export const BaseDef = z.strictObject({
  area: Id,
  /** 最初から拠点（起点のベッドの部屋＝拠点0） */
  initial: z.boolean().default(false),
  /** 眠ったとき・拠点へ移動したときに立つ位置（area.json の spawns の名前） */
  spawn: Id,
  /** 段階ごとの費用。stage 1 は拠点にするとき（initial なら不要） */
  stages: z
    .array(z.strictObject({ stage: z.number().int().min(1).max(4), cost: Cost.default([]) }))
    .default([]),
});
export type BaseDef = z.infer<typeof BaseDef>;

/** 経済の全体設定。content/world/economy.json */
export const Economy = z.strictObject({
  /** 手持ちのマス数 */
  pocketSlots: z.number().int().positive(),
  /** 拠点の段階ごとの倉庫のマス数（[段階1, 段階2, …]） */
  storageSlots: z.array(z.number().int().positive()).min(1),
  /** n 個目の拠点の費用 = 基本量 × growth^(n-1) */
  baseCostGrowth: z.number().min(1),
  /** 最初の拠点（initial）の倉庫に、1 回だけ入れておく物（決定 62） */
  starter: z.array(z.strictObject({ item: Id, count: z.number().int().positive() })).default([]),
});
export type Economy = z.infer<typeof Economy>;

/** 揺らぎ区域で入るたびに散らばる素材 */
export const Gather = z.strictObject({
  count: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  items: z.array(z.strictObject({ item: Id, weight: z.number().positive().default(1) })).min(1),
});
export type Gather = z.infer<typeof Gather>;
