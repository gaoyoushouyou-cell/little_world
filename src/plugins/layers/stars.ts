import { z } from 'zod';
import { defineLayer } from './_types';
import { Color, Vec2 } from '../../schema/common';
import { VIEW_H, VIEW_W } from '../../engine/constants';
import { makeCanvas } from '../../engine/pixelart';
import { makeRng } from '../../engine/rng';

/** 繰り返す星空。scroll が小さいほど遠くに見える */
export default defineLayer({
  type: 'stars',
  params: z.strictObject({
    density: z.number().min(0).max(0.05).default(0.0025),
    colors: z.array(Color).min(1).default(['#ffffff', '#bcd2ff', '#ffd9f0']),
    scroll: z.number().default(0.05),
    autoScroll: Vec2.default([0, 0]),
    alpha: z.number().min(0).max(1).default(1),
    seed: z.string().default('stars'),
  }),
  create(ctx, p) {
    const key = `stars:${ctx.area.def.id}:${ctx.depth}`;
    if (!ctx.scene.textures.exists(key)) {
      const [canvas, c2d] = makeCanvas(VIEW_W, VIEW_H);
      const rnd = makeRng(p.seed);
      const count = Math.round(VIEW_W * VIEW_H * p.density);
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rnd() * VIEW_W);
        const y = Math.floor(rnd() * VIEW_H);
        c2d.fillStyle = p.colors[Math.floor(rnd() * p.colors.length)]!;
        c2d.globalAlpha = 0.4 + rnd() * 0.6;
        c2d.fillRect(x, y, 1, 1);
        if (rnd() < 0.06) {
          // 十字に光る大きめの星
          c2d.globalAlpha *= 0.6;
          c2d.fillRect(x - 1, y, 1, 1);
          c2d.fillRect(x + 1, y, 1, 1);
          c2d.fillRect(x, y - 1, 1, 1);
          c2d.fillRect(x, y + 1, 1, 1);
        }
      }
      ctx.scene.textures.addCanvas(key, canvas);
      ctx.track(key);
    }
    const sprite = ctx.scene.add
      .tileSprite(0, 0, VIEW_W, VIEW_H, key)
      .setOrigin(0)
      .setScrollFactor(0)
      .setAlpha(p.alpha)
      .setDepth(ctx.depth);
    return {
      update(cam, time) {
        sprite.tilePositionX = Math.round(cam.scrollX * p.scroll + (p.autoScroll[0] * time) / 1000);
        sprite.tilePositionY = Math.round(cam.scrollY * p.scroll + (p.autoScroll[1] * time) / 1000);
      },
    };
  },
});
