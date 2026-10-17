import { z } from 'zod';
import { Id, IntPair } from './common';
import { Trigger } from './area';

export const WarpEnd = z.strictObject({
  area: Id,
  /** エリア内のタイル座標 */
  at: IntPair,
});

export const Warp = z.strictObject({
  id: Id,
  from: WarpEnd,
  to: WarpEnd,
  bidirectional: z.boolean().default(false),
  trigger: Trigger.default('interact'),
});
export type Warp = z.infer<typeof Warp>;

export const MapDef = z.strictObject({
  version: z.literal(1),
  start: z.strictObject({ area: Id, spawn: Id }),
  /** プレイヤーの見た目（content/assets/sprites/<sprite>.json） */
  player: z.strictObject({ sprite: Id }).default({ sprite: 'dreamer' }),
  /** pos は世界座標（タイル単位）でのエリアの左上 */
  areas: z.array(z.strictObject({ id: Id, pos: IntPair })),
  warps: z.array(Warp).default([]),
  seeds: z.array(Id).default([]),
});
export type MapDef = z.infer<typeof MapDef>;
