import { z } from 'zod';
import { Color, Id } from './common';

/**
 * ドット絵：パレット（1文字 → 色、null は透明）と文字グリッド。
 * Claude がテキストで書ける形式。
 */
export const PixelArt = z
  .strictObject({
    palette: z.record(z.string().length(1), Color.nullable()),
    pixels: z.array(z.string()).min(1),
  })
  .superRefine((art, ctx) => {
    const w = art.pixels[0]!.length;
    art.pixels.forEach((row, y) => {
      if (row.length !== w) {
        ctx.addIssue({ code: 'custom', message: `${y} 行目の幅が ${row.length}（1行目は ${w}）`, path: ['pixels', y] });
      }
      for (const ch of row) {
        if (!(ch in art.palette)) {
          ctx.addIssue({ code: 'custom', message: `${y} 行目の文字 "${ch}" がパレットにない`, path: ['pixels', y] });
          break;
        }
      }
    });
  });
export type PixelArt = z.infer<typeof PixelArt>;

/** 手続き生成で描くタイルの模様（段階2でドット絵に置き換えていく） */
export const TileStyle = z.enum(['plain', 'speckle', 'brick', 'topped', 'plank', 'flower', 'boulder', 'glow']);
export type TileStyle = z.infer<typeof TileStyle>;

/** 元にした原画（リポジトリ直下からのパス。例: "art/tiles/night_stone.png"） */
export const Source = z.string().regex(/^art\/.+\.(png|jpe?g)$/i, 'source は art/ の中の PNG / JPEG のパス');

export const TileDef = z.strictObject({
  solid: z.boolean().default(false),
  color: Color,
  accent: Color.optional(),
  style: TileStyle.default('plain'),
  /** 指定すると手続き生成の代わりにこのドット絵（16×16）を使う */
  art: PixelArt.optional(),
  source: Source.optional(),
});
export type TileDef = z.infer<typeof TileDef>;

export const Tileset = z.strictObject({
  tiles: z.record(Id, TileDef),
});
export type Tileset = z.infer<typeof Tileset>;

/** エリアのタイル配置：凡例（1文字 → タイル ID、null は空）とレイヤーごとの行 */
export const AreaTiles = z.strictObject({
  legend: z.record(z.string().length(1), Id.nullable()),
  layers: z.record(Id, z.array(z.string())),
});
export type AreaTiles = z.infer<typeof AreaTiles>;

export const Sprite = z.strictObject({
  palette: z.record(z.string().length(1), Color.nullable()),
  /** アニメーション名 → コマ（文字グリッド）の配列 */
  animations: z.record(Id, z.array(z.array(z.string()).min(1)).min(1)),
  /** 1コマあたりのステップ数（60 = 1秒） */
  frameSteps: z.number().int().positive().default(8),
  /** アニメーション名 → 元にした原画 */
  source: z.record(Id, Source).optional(),
});
export type Sprite = z.infer<typeof Sprite>;
