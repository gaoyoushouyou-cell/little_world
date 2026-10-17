import { z } from 'zod';
import { Id, IntPair, Vec2 } from './common';

export const View = z.enum(['side', 'top']);
export type View = z.infer<typeof View>;

export const Wrap = z.enum(['none', 'horizontal', 'vertical', 'both']);
export type Wrap = z.infer<typeof Wrap>;

/**
 * 物理条件。単位は px / 60fps の1ステップ。
 * 見下ろし（top）では gravity / jump / maxFall は使わない。
 */
export const Physics = z.strictObject({
  gravity: Vec2.default([0, 0.3]),
  /** 入力がないときの減速（1ステップごとに速度へ掛ける） */
  friction: z.number().min(0).max(1).default(0.8),
  /** 空中で入力がないときの減速 */
  airFriction: z.number().min(0).max(1).default(0.95),
  /** 入力による加速 */
  accel: z.number().positive().default(0.25),
  maxSpeed: z.number().positive().default(2),
  jump: z.number().min(0).default(5.2),
  maxFall: z.number().positive().default(7),
  /** 世界全体の時間の速さ */
  timeScale: z.number().positive().max(4).default(1),
  wrap: Wrap.default('none'),
});
export type Physics = z.infer<typeof Physics>;

/** レイヤーは type ごとのプラグインがパラメータを検証する */
export const LayerRef = z.looseObject({ type: z.string() });
export type LayerRef = z.infer<typeof LayerRef>;

export const Trigger = z.enum(['interact', 'touch']);
export type Trigger = z.infer<typeof Trigger>;

/** エリア内の出入口（扉・穴など）。別エリアの spawn へ移動する */
export const Exit = z.strictObject({
  id: Id,
  at: IntPair,
  size: IntPair.optional(),
  to: Id,
  spawn: Id,
  trigger: Trigger.default('interact'),
});
export type Exit = z.infer<typeof Exit>;

export const Area = z.strictObject({
  id: Id,
  name: z.string(),
  view: View,
  /** タイル数 [幅, 高さ] */
  size: IntPair.refine(([w, h]) => w > 0 && h > 0, '大きさは正の値'),
  depth: z.number().int().min(1).max(7),
  physics: Physics.default(Physics.parse({})),
  layers: z.array(LayerRef).min(1),
  /** mood の色にどれだけ染まるか（段階4で使う） */
  moodTint: z.number().min(0).max(1).default(1),
  /** エリア規則（段階6で使う） */
  rules: z.array(z.looseObject({ type: z.string() })).default([]),
  effectPolicy: z.strictObject({ disable: z.array(Id).default([]) }).default({ disable: [] }),
  madnessPolicy: z.looseObject({}).default({}),
  exits: z.array(Exit).default([]),
  /** 名前付きの出現位置（タイル座標） */
  spawns: z.record(Id, IntPair).default({}),
  /** true なら揺らぎ区域（入るたびに作り直す。段階7で使う） */
  resetOnEnter: z.boolean().default(false),
  basable: z.boolean().default(false),
});
export type Area = z.infer<typeof Area>;
