import { z } from 'zod';
import { Id, IntPair } from './common';

/**
 * エリアに置く物（家具・扉・像・木など）の定義。content/objects/<id>.json
 * 見た目はスプライト、当たり判定はマス（16 ドット）単位。
 */
export const ObjectDef = z.strictObject({
  id: Id,
  name: z.string().optional(),
  /** content/assets/sprites/<sprite>.json */
  sprite: Id,
  animation: Id.default('idle'),
  collision: z
    .strictObject({
      /** 見下ろし：床の上でぶつかる範囲 [横, 奥行き]（マス）。省略するとぶつからない */
      top: IntPair.optional(),
      /** 横視点：固い範囲 [横, 高さ]（マス）。省略するとぶつからない */
      side: IntPair.optional(),
    })
    .default({}),
  /** 当たり判定がユーザーに確認されていない仮のものなら true */
  provisional: z.boolean().default(false),
  note: z.string().optional(),
});
export type ObjectDef = z.infer<typeof ObjectDef>;

/** エリアの中での配置。content/areas/<id>/entities.json */
export const Placement = z.strictObject({
  object: Id,
  /** 足元のタイル（当たり判定の範囲の、重力の向きの側の左端のマス） */
  at: IntPair,
  /** 位置の微調整（ドット） */
  offset: IntPair.default([0, 0]),
  flipX: z.boolean().default(false),
  /** 横視点で、プレイヤーより手前に描く */
  front: z.boolean().default(false),
});
export type Placement = z.infer<typeof Placement>;

export const Entities = z.array(Placement);
