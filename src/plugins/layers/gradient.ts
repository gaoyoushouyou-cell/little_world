import { z } from 'zod';
import { defineLayer } from './_types';
import { Color } from '../../schema/common';
import { VIEW_H, VIEW_W } from '../../engine/constants';
import { makeCanvas } from '../../engine/pixelart';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 画面に固定した縦のグラデーション。段階的な色をディザでつなぐ（ドット絵らしく） */
export default defineLayer({
  type: 'gradient',
  params: z.strictObject({
    colors: z.array(Color).min(2),
    /** 色と色の間の段の数 */
    steps: z.number().int().min(1).max(64).default(10),
    scroll: z.number().default(0),
  }),
  create(ctx, p) {
    const key = `gradient:${ctx.area.def.id}:${ctx.depth}`;
    if (!ctx.scene.textures.exists(key)) {
      const [canvas, c2d] = makeCanvas(VIEW_W, VIEW_H);
      const stops = p.colors.map(toRgb);
      const bands = p.steps * (stops.length - 1);
      const bandColor: [number, number, number][] = [];
      for (let b = 0; b <= bands; b++) {
        const t = b / bands;
        const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
        const local = t * (stops.length - 1) - seg;
        const a = stops[seg]!;
        const c = stops[seg + 1]!;
        bandColor.push([0, 1, 2].map((i) => Math.round(a[i]! + (c[i]! - a[i]!) * local)) as [number, number, number]);
      }
      const img = c2d.createImageData(VIEW_W, VIEW_H);
      for (let y = 0; y < VIEW_H; y++) {
        const v = (y / (VIEW_H - 1)) * bands;
        const base = Math.floor(v);
        const frac = v - base;
        for (let x = 0; x < VIEW_W; x++) {
          const threshold = (BAYER4[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
          const color = bandColor[Math.min(bands, base + (frac > threshold ? 1 : 0))]!;
          const o = (y * VIEW_W + x) * 4;
          img.data[o] = color[0];
          img.data[o + 1] = color[1];
          img.data[o + 2] = color[2];
          img.data[o + 3] = 255;
        }
      }
      c2d.putImageData(img, 0, 0);
      ctx.scene.textures.addCanvas(key, canvas);
      ctx.track(key);
    }
    ctx.scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(ctx.depth);
    return {};
  },
});
