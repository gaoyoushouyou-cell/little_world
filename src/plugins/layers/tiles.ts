import { z } from 'zod';
import { defineLayer } from './_types';
import { Id } from '../../schema/common';
import { TILE } from '../../engine/constants';
import { drawTile, makeCanvas } from '../../engine/pixelart';
import { wrapsX, wrapsY } from '../../engine/world';
import type { TileDef } from '../../schema/assets';

/** 大きなエリアでもテクスチャが大きくなりすぎないよう、64×64 タイルごとに分けて描く */
const CHUNK = 64;

const tileCanvasCache = new Map<string, HTMLCanvasElement>();

function tileCanvas(id: string, def: TileDef): HTMLCanvasElement {
  let c = tileCanvasCache.get(id);
  if (!c) {
    const [canvas, ctx] = makeCanvas(TILE, TILE);
    drawTile(ctx, id, def, 0, 0);
    tileCanvasCache.set(id, canvas);
    c = canvas;
  }
  return c;
}

/**
 * tiles.json の1レイヤーを描く。collide: true のレイヤーのタイルの solid が当たり判定になる
 * （当たり判定の組み立ては engine/content.ts）。
 */
export default defineLayer({
  type: 'tiles',
  params: z.strictObject({
    id: Id,
    collide: z.boolean().default(false),
    alpha: z.number().min(0).max(1).default(1),
  }),
  create(ctx, p) {
    const grid = ctx.area.grids[p.id];
    if (!grid) return {};
    const { scene, tiles } = ctx;
    const areaW = grid.w * TILE;
    const areaH = grid.h * TILE;
    const copiesX = wrapsX(ctx.area.def.physics.wrap) ? [-1, 0, 1] : [0];
    const copiesY = wrapsY(ctx.area.def.physics.wrap) ? [-1, 0, 1] : [0];

    for (let cy = 0; cy * CHUNK < grid.h; cy++) {
      for (let cx = 0; cx * CHUNK < grid.w; cx++) {
        const key = `tiles:${ctx.area.def.id}:${p.id}:${cx}:${cy}`;
        if (!scene.textures.exists(key)) {
          const tw = Math.min(CHUNK, grid.w - cx * CHUNK);
          const th = Math.min(CHUNK, grid.h - cy * CHUNK);
          const [canvas, c2d] = makeCanvas(tw * TILE, th * TILE);
          for (let y = 0; y < th; y++) {
            for (let x = 0; x < tw; x++) {
              const id = grid.get(cx * CHUNK + x, cy * CHUNK + y);
              const def = id ? tiles.get(id) : undefined;
              if (id && def) c2d.drawImage(tileCanvas(id, def), x * TILE, y * TILE);
            }
          }
          scene.textures.addCanvas(key, canvas);
          ctx.track(key);
        }
        for (const ox of copiesX) {
          for (const oy of copiesY) {
            scene.add
              .image(cx * CHUNK * TILE + ox * areaW, cy * CHUNK * TILE + oy * areaH, key)
              .setOrigin(0)
              .setAlpha(p.alpha)
              .setDepth(ctx.depth);
          }
        }
      }
    }
    return {};
  },
});
