import { z } from 'zod';
import { defineLayer } from './_types';
import { Color, Vec2 } from '../../schema/common';
import { TILE, VIEW_H, VIEW_W } from '../../engine/constants';
import { makeCanvas } from '../../engine/pixelart';
import { makeRng } from '../../engine/rng';

/**
 * 横に繰り返す影絵（丘・塔・とげ）。遠景・中景・前景に使う。
 * baseline はエリアの高さに対する影の下端の位置（1 = 一番下）。
 */
export default defineLayer({
  type: 'silhouette',
  params: z.strictObject({
    kind: z.enum(['hills', 'towers', 'spikes']),
    color: Color,
    /** 塔の窓などの点 */
    accent: Color.optional(),
    scroll: z.number().default(0.3),
    height: z.number().int().min(4).max(400).default(80),
    baseline: z.number().min(0).max(1.5).default(1),
    offsetY: z.number().default(0),
    /** 繰り返しの幅（px） */
    period: z.number().int().min(64).max(2048).default(512),
    autoScroll: Vec2.default([0, 0]),
    alpha: z.number().min(0).max(1).default(1),
    seed: z.string().optional(),
  }),
  create(ctx, p) {
    const key = `silhouette:${ctx.area.def.id}:${ctx.depth}`;
    if (!ctx.scene.textures.exists(key)) {
      const [canvas, c2d] = makeCanvas(p.period, p.height);
      const rnd = makeRng(p.seed ?? `${p.kind}:${ctx.area.def.id}:${ctx.depth}`);
      c2d.fillStyle = p.color;
      const H = p.height;
      if (p.kind === 'hills') {
        const k1 = 1 + Math.floor(rnd() * 2);
        const k2 = 3 + Math.floor(rnd() * 3);
        const k3 = 7 + Math.floor(rnd() * 4);
        const ph = [rnd(), rnd(), rnd()].map((v) => v * Math.PI * 2);
        for (let x = 0; x < p.period; x++) {
          const t = (x / p.period) * Math.PI * 2;
          const v = 0.55 + 0.22 * Math.sin(t * k1 + ph[0]!) + 0.13 * Math.sin(t * k2 + ph[1]!) + 0.05 * Math.sin(t * k3 + ph[2]!);
          const top = Math.round(H * (1 - Math.max(0.05, Math.min(1, v))));
          c2d.fillRect(x, top, 1, H - top);
        }
      } else if (p.kind === 'towers') {
        let x = 0;
        while (x < p.period) {
          const w = Math.min(p.period - x, 6 + Math.floor(rnd() * 22));
          const top = Math.round(H * (1 - (0.25 + rnd() * 0.75)));
          c2d.fillStyle = p.color;
          c2d.fillRect(x, top, w, H - top);
          if (rnd() < 0.4 && w > 8) c2d.fillRect(x + Math.floor(w / 2) - 1, top - 6, 2, 6); // 尖塔
          if (p.accent) {
            c2d.fillStyle = p.accent;
            for (let wy = top + 3; wy < H - 2; wy += 4) {
              for (let wx = x + 2; wx < x + w - 2; wx += 3) {
                if (rnd() < 0.12) c2d.fillRect(wx, wy, 1, 1);
              }
            }
          }
          x += w + Math.floor(rnd() * 7);
        }
      } else {
        let x = 0;
        while (x < p.period) {
          const w = Math.min(p.period - x, 8 + Math.floor(rnd() * 24));
          const peak = Math.round(H * (0.3 + rnd() * 0.7));
          for (let i = 0; i < w; i++) {
            const h = Math.round(peak * (1 - Math.abs((i - w / 2) / (w / 2))));
            c2d.fillRect(x + i, H - h, 1, h);
          }
          x += w - Math.floor(rnd() * 4);
        }
      }
      ctx.scene.textures.addCanvas(key, canvas);
      ctx.track(key);
    }

    const sprite = ctx.scene.add
      .tileSprite(0, 0, VIEW_W, p.height, key)
      .setOrigin(0)
      .setScrollFactor(0)
      .setAlpha(p.alpha)
      .setDepth(ctx.depth);
    const areaH = ctx.area.def.size[1] * TILE;
    const camMaxY = Math.max(0, areaH - VIEW_H);
    // カメラが一番下にあるとき、影の下端がエリアの baseline に来るように合わせる
    const bottom = areaH * p.baseline - camMaxY * (1 - p.scroll) + p.offsetY;
    return {
      update(cam, time) {
        sprite.y = Math.round(bottom - cam.scrollY * p.scroll - p.height);
        sprite.tilePositionX = Math.round(cam.scrollX * p.scroll + (p.autoScroll[0] * time) / 1000);
      },
    };
  },
});
