import { z } from 'zod';
import { defineLayer } from './_types';
import { Color, Vec2 } from '../../schema/common';
import { VIEW_H, VIEW_W } from '../../engine/constants';
import { makeCanvas } from '../../engine/pixelart';
import { makeRng } from '../../engine/rng';

const SIZE = 256;
const CELLS = 8;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 漂う霧。soft = false なら一様な暗さ */
export default defineLayer({
  type: 'fog',
  params: z.strictObject({
    color: Color.default('#000000'),
    density: z.number().min(0).max(1).default(0.25),
    /** 霧が流れる速さ（px/秒） */
    drift: Vec2.default([4, 0]),
    scroll: z.number().default(1),
    soft: z.boolean().default(true),
    seed: z.string().default('fog'),
  }),
  create(ctx, p) {
    if (!p.soft) {
      const rect = ctx.scene.add.rectangle(0, 0, VIEW_W, VIEW_H, parseInt(p.color.slice(1, 7), 16), p.density);
      rect.setOrigin(0).setScrollFactor(0).setDepth(ctx.depth);
      return {};
    }
    const key = `fog:${ctx.area.def.id}:${ctx.depth}`;
    if (!ctx.scene.textures.exists(key)) {
      const rnd = makeRng(p.seed);
      const grid = Array.from({ length: CELLS * CELLS }, () => rnd());
      const at = (x: number, y: number) => grid[((y + CELLS) % CELLS) * CELLS + ((x + CELLS) % CELLS)]!;
      const smooth = (t: number) => t * t * (3 - 2 * t);
      const [canvas, c2d] = makeCanvas(SIZE, SIZE);
      const img = c2d.createImageData(SIZE, SIZE);
      const n = parseInt(p.color.slice(1, 7), 16);
      const cell = SIZE / CELLS;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const gx = Math.floor(x / cell);
          const gy = Math.floor(y / cell);
          const fx = smooth((x % cell) / cell);
          const fy = smooth((y % cell) / cell);
          const top = at(gx, gy) * (1 - fx) + at(gx + 1, gy) * fx;
          const bot = at(gx, gy + 1) * (1 - fx) + at(gx + 1, gy + 1) * fx;
          const v = top * (1 - fy) + bot * fy;
          // 4段に量子化してディザでつなぐ
          const levels = 4;
          const q = v * levels;
          const base = Math.floor(q);
          const threshold = (BAYER4[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
          const level = Math.min(levels, base + (q - base > threshold ? 1 : 0)) / levels;
          const o = (y * SIZE + x) * 4;
          img.data[o] = (n >> 16) & 255;
          img.data[o + 1] = (n >> 8) & 255;
          img.data[o + 2] = n & 255;
          img.data[o + 3] = Math.round(level * 255);
        }
      }
      c2d.putImageData(img, 0, 0);
      ctx.scene.textures.addCanvas(key, canvas);
      ctx.track(key);
    }
    const sprite = ctx.scene.add
      .tileSprite(0, 0, VIEW_W, VIEW_H, key)
      .setOrigin(0)
      .setScrollFactor(0)
      .setAlpha(p.density)
      .setDepth(ctx.depth);
    return {
      update(cam, time) {
        sprite.tilePositionX = Math.round(cam.scrollX * p.scroll - (p.drift[0] * time) / 1000);
        sprite.tilePositionY = Math.round(cam.scrollY * p.scroll - (p.drift[1] * time) / 1000);
      },
    };
  },
});
