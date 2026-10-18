import { z } from 'zod';
import { Id } from './common';
import { Cost } from './economy';

/**
 * 加工のレシピ（段階 C、決定 64〜68）。content/recipes/<id>.json
 * station：hand = 手作り（どこでも C）、workbench = 作業台を調べたとき
 */
export const RecipeDef = z.strictObject({
  id: Id,
  output: z.strictObject({ item: Id, count: z.number().int().positive().default(1) }),
  inputs: Cost.min(1),
  station: z.enum(['hand', 'workbench']).default('workbench'),
  note: z.string().optional(),
});
export type RecipeDef = z.infer<typeof RecipeDef>;
export type Station = RecipeDef['station'];
