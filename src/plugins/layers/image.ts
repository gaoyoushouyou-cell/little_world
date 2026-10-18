import type Phaser from 'phaser';
import { z } from 'zod';
import { defineLayer } from './_types';
import { Vec2 } from '../../schema/common';
import { TILE, VIEW_W } from '../../engine/constants';
import { scaleImage } from '../../engine/images';
import { placeImage, sourcePixelAt } from '../../engine/imagelayout';
import { makeCanvas } from '../../engine/pixelart';

/**
 * ユーザーの原画から作った PNG（content/assets/images/）を描く。遠景・中景・前景に使う。
 * 縦の位置は影絵（silhouette）と同じ決まり。原寸の絵を scale で整数倍に拡大する。
 * 置き方の計算は engine/imagelayout.ts（描画の検証と共通）。
 */
export default defineLayer({
  type: 'image',
  params: z.strictObject({
    /** content/assets/images/ からのパス（拡張子なし。例 "backgrounds/promenade_far"） */
    image: z.string().regex(/^[a-z0-9_]+(\/[a-z0-9_]+)*$/, 'image は英小文字・数字・_ と / のパス'),
    scroll: z.number().default(0.3),
    baseline: z.number().min(0).max(1.5).default(1),
    offsetY: z.number().default(0),
    /** 横に繰り返す（左右がつながる絵だけ） */
    repeatX: z.boolean().default(true),
    /** 繰り返さないときの左端（画面の px、カメラが左端のとき） */
    x: z.number().default(0),
    scale: z.number().int().min(1).max(8).default(1),
    /** ひとりでに流れる速さ（px/秒）。横だけ */
    autoScroll: Vec2.default([0, 0]),
    alpha: z.number().min(0).max(1).default(1),
  }),
  images: (p) => [p.image],
  check(p, images) {
    const img = images.get(p.image);
    if (img && p.repeatX && img.width % 16 !== 0) return [`横に繰り返す画像 "${p.image}" の幅 ${img.width} が 16 の倍数でない`];
    return [];
  },
  create(ctx, p) {
    const img = ctx.images.get(p.image);
    if (!img) throw new Error(`画像 "${p.image}" が読み込まれていない`);
    const key = `image:${ctx.area.def.id}:${ctx.depth}`;
    if (!ctx.scene.textures.exists(key)) {
      // テクスチャを拡大しておき、描くときは等倍にする（位置の計算を画面の px だけで済ませる）
      const big = scaleImage(img, p.scale);
      const [canvas, c2d] = makeCanvas(big.width, big.height);
      const data = c2d.createImageData(big.width, big.height);
      data.data.set(big.data);
      c2d.putImageData(data, 0, 0);
      ctx.scene.textures.addCanvas(key, canvas);
      ctx.track(key);
    }
    const h = img.height * p.scale;
    const tile = p.repeatX ? ctx.scene.add.tileSprite(0, 0, VIEW_W, h, key) : null;
    const obj = tile ?? ctx.scene.add.image(0, 0, key);
    obj.setOrigin(0).setScrollFactor(0).setAlpha(p.alpha).setDepth(ctx.depth);
    const areaH = ctx.area.def.size[1] * TILE;
    const place = (cam: Phaser.Cameras.Scene2D.Camera, time: number) => placeImage(p, img, areaH, cam, time);

    return {
      objects: [obj],
      update(cam, time) {
        const pl = place(cam, time);
        obj.y = pl.y;
        if (tile) tile.tilePositionX = pl.shift;
        else obj.x = pl.x;
      },
      expect(cam, time) {
        if (p.alpha < 1) return { colorAt: () => null, skip: `半透明（alpha ${p.alpha}）で重ねるので1ドットずつは比べない` };
        const pl = place(cam, time);
        return {
          colors: img.palette,
          colorAt(sx, sy) {
            const uv = sourcePixelAt(pl, sx, sy);
            if (!uv) return null;
            const o = (uv[1] * img.width + uv[0]) * 4;
            if (img.data[o + 3]! < 128) return null;
            return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
          },
        };
      },
    };
  },
});
