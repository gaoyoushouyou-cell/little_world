import { z } from 'zod';
import { defineLayer } from './_types';
import { Color, Vec2 } from '../../schema/common';
import { VIEW_H, VIEW_W } from '../../engine/constants';
import { makeRng } from '../../engine/rng';
import { mod } from '../../engine/world';

/** 漂う粒（泡・花びら・羽根・塵）。画面の大きさで繰り返す */
export default defineLayer({
  type: 'particles',
  params: z.strictObject({
    count: z.number().int().min(1).max(400).default(40),
    colors: z.array(Color).min(1).default(['#ffffff']),
    size: z.number().int().min(1).max(4).default(1),
    /** px/秒 */
    velocity: Vec2.default([0, -8]),
    /** 左右の揺れ幅（px） */
    wobble: z.number().min(0).default(6),
    scroll: z.number().default(1),
    alpha: z.number().min(0).max(1).default(0.8),
    seed: z.string().default('particles'),
  }),
  create(ctx, p) {
    const rnd = makeRng(p.seed);
    const parts = Array.from({ length: p.count }, () => ({
      x: rnd() * VIEW_W,
      y: rnd() * VIEW_H,
      speed: 0.6 + rnd() * 0.8,
      phase: rnd() * Math.PI * 2,
      color: parseInt(p.colors[Math.floor(rnd() * p.colors.length)]!.slice(1, 7), 16),
      alpha: p.alpha * (0.5 + rnd() * 0.5),
    }));
    const g = ctx.scene.add.graphics().setScrollFactor(0).setDepth(ctx.depth);
    return {
      update(cam, time) {
        const t = time / 1000;
        g.clear();
        for (const q of parts) {
          const wob = Math.sin(t * 1.3 + q.phase) * p.wobble;
          const x = mod(q.x + p.velocity[0] * t * q.speed + wob - cam.scrollX * p.scroll, VIEW_W);
          const y = mod(q.y + p.velocity[1] * t * q.speed - cam.scrollY * p.scroll, VIEW_H);
          g.fillStyle(q.color, q.alpha);
          g.fillRect(Math.round(x), Math.round(y), p.size, p.size);
        }
      },
    };
  },
});
