import { z } from 'zod';

/** ID は英小文字・数字・アンダースコア。一度決めたら変えない */
export const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ID は英小文字で始まる a-z / 0-9 / _ のみ');

/** タイル座標などの整数ペア [x, y] */
export const IntPair = z.tuple([z.number().int(), z.number().int()]);

/** 実数ペア [x, y] */
export const Vec2 = z.tuple([z.number(), z.number()]);

export const Color = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, '色は #rrggbb か #rrggbbaa');

export type IntPair = z.infer<typeof IntPair>;
export type Vec2 = z.infer<typeof Vec2>;
