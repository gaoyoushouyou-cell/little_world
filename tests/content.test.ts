/// <reference types="node" />
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Content } from '../src/engine/content';
import { TILE } from '../src/engine/constants';
import { decodePngFile } from '../tools/lib/png-file';
import { Walker } from '../tools/lib/walker';

/**
 * content/ の実データを読み込み、検証と、エリアをまたぐ移動を通しで確かめる。
 */

let content: Content;

beforeAll(async () => {
  content = new Content({ decodeImage: decodePngFile });
  for (const id of content.areas.keys()) await content.loadArea(id);
});

describe('content の検証', () => {
  it('エラーも警告もない', () => {
    expect(content.issues).toEqual([]);
  });

  it('加工したアセットの source が art/ に実在する', () => {
    const sources = [
      ...[...content.tiles.values()].map((t) => t.source),
      ...[...content.sprites.values()].flatMap((s) => Object.values(s.source ?? {})),
    ].filter((s): s is string => !!s);
    const missing = sources.filter((s) => !existsSync(fileURLToPath(new URL(`../${s}`, import.meta.url))));
    expect(missing).toEqual([]);
  });
});

describe('画像', () => {
  it('レイヤーが使う画像を、エリアと一緒に読み込んでいる', () => {
    for (const [id, area] of content.areas) {
      for (const layer of area.layers) {
        if (layer.type === 'image') expect(content.images.has(String(layer.image)), `${id}: ${String(layer.image)}`).toBe(true);
      }
    }
  });
});

describe('エリアをまたぐ移動', () => {
  it('寝室（見下ろし）の東の出口から、沈んだ遊歩道（横）の床の上に出る', () => {
    const w = new Walker(content, 'bed_room', { kind: 'tile', tile: [5, 10] }).run({ y: -1 }, 40).run({ x: 1 }, 400, true);
    expect(w.area.def.id).toBe('sunken_promenade');
    w.run({}, 60);
    expect(w.body.grounded).toBe(true);
    expect(w.tile[1]).toBe(23);
    expect(w.tile[0]).toBeLessThan(3);
  });

  it('遊歩道から西へ戻ると寝室に入る', () => {
    const w = new Walker(content, 'sunken_promenade', { kind: 'tile', tile: [3, 23] }).run({ x: -1 }, 200, true);
    expect(w.area.def.id).toBe('bed_room');
    expect(w.tile[0]).toBe(19);
    expect([6, 7]).toContain(w.tile[1]); // 東の出口（6〜7 行目）
  });

  it('遊歩道の東端から逆さの水族館へ入ると、上向きの重力で通路の天井に立つ', () => {
    const w = new Walker(content, 'sunken_promenade', { kind: 'tile', tile: [87, 23] }).run({ x: 1 }, 120, true);
    expect(w.area.def.id).toBe('inverted_aquarium');
    w.run({}, 200);
    expect(w.body.grounded).toBe(true);
    expect(w.body.y).toBe(20 * TILE);
  });

  it('水族館の通路から西へ戻ると、遊歩道の床に立つ', () => {
    const w = new Walker(content, 'inverted_aquarium', { kind: 'tile', tile: [3, 20] }).run({ x: -1 }, 200, true).run({}, 120);
    expect(w.area.def.id).toBe('sunken_promenade');
    expect(w.body.grounded).toBe(true);
    expect(w.body.y + w.body.h).toBe(24 * TILE);
  });

  it('水族館の通路を抜けると、天井へ「落ちる」', () => {
    const w = new Walker(content, 'inverted_aquarium', { kind: 'tile', tile: [3, 20] }).run({ x: 1 }, 90).run({}, 400);
    expect(w.area.def.id).toBe('inverted_aquarium');
    expect(w.body.grounded).toBe(true);
    expect(w.body.y).toBeLessThan(19 * TILE); // 通路（20 行目）より上の足場の下面に立っている
  });

  it('寝室のベッドは通り抜けられない（置いた物の当たり判定）', () => {
    // ベッド（2 列目、10〜11 行目）の右側から左へ歩く
    const w = new Walker(content, 'bed_room', { kind: 'tile', tile: [5, 11] }).run({ x: -1 }, 120);
    expect(w.body.x).toBeGreaterThanOrEqual(3 * TILE);
  });

  it('終わらない野原は端がループし、エリアは変わらない', () => {
    const w = new Walker(content, 'endless_field', { kind: 'tile', tile: [18, 12] });
    const startX = w.body.x;
    w.run({ y: 1 }, 30).run({ y: -1 }, 30); // 中央の岩のない場所で上下に少し動く
    w.run({ x: -1 }, 500);
    expect(w.area.def.id).toBe('endless_field');
    expect(w.body.x).toBeGreaterThanOrEqual(-w.body.w);
    expect(w.body.x).toBeLessThan(36 * TILE);
    expect(w.visited).toEqual(['endless_field']);
    expect(w.body.x).not.toBe(startX);
  });
});
