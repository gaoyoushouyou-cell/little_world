/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Content, type LoadedArea } from '../src/engine/content';
import type { ImageDecoder } from '../src/engine/images';
import { TILE } from '../src/engine/constants';
import { stepBody, type Body, type StepInput, type StepParams } from '../src/engine/physics';
import { checkEdge, placeArrival, stepParamsFor, type Arrival } from '../src/engine/travel';
import { makeSolidQuery } from '../src/engine/world';

/**
 * content/ の実データを読み込み、検証と、エリアをまたぐ移動を通しで確かめる。
 */

let content: Content;

/** テストではブラウザの代わりに、PNG をファイルから読む（URL は "/content/assets/images/…png"） */
const root = fileURLToPath(new URL('..', import.meta.url));
const decodePngFile: ImageDecoder = async (url) => {
  const path = url.split('?')[0]!;
  const file = path.startsWith('/@fs/') ? path.slice(4) : join(root, path);
  const png = pngjs.PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};

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

/** プレイヤー1人分の移動を、エリアの切り替えも含めて進める */
class Walker {
  area!: LoadedArea;
  params!: StepParams;
  body!: Body;
  private solid!: ReturnType<typeof makeSolidQuery>;
  readonly visited: string[] = [];

  constructor(areaId: string, arrival: Arrival) {
    this.enter(areaId, arrival);
  }

  private enter(areaId: string, arrival: Arrival) {
    this.area = content.getLoaded(areaId)!;
    this.params = stepParamsFor(this.area.def);
    this.solid = makeSolidQuery(
      { id: areaId, solid: this.area.solid, wrap: this.area.def.physics.wrap },
      content.world,
      (id) => content.getLoaded(id)?.solid,
    );
    this.body = placeArrival(arrival, this.params, this.solid);
    this.visited.push(areaId);
  }

  run(input: Partial<StepInput>, steps: number, untilCross = false) {
    for (let i = 0; i < steps; i++) {
      stepBody(this.body, { x: 0, y: 0, jumpHeld: false, jumpPressed: false, ...input, ...(i > 0 ? { jumpPressed: false } : {}) }, this.params, this.solid);
      const r = checkEdge(this.body, this.area, this.params, content.world);
      if (r.kind === 'cross') {
        this.enter(r.to.id, r.arrival);
        if (untilCross) break;
      }
    }
    return this;
  }

  get tile() {
    return [Math.floor((this.body.x + this.body.w / 2) / TILE), Math.floor((this.body.y + this.body.h / 2) / TILE)];
  }
}

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
    const w = new Walker('bed_room', { kind: 'tile', tile: [5, 10] }).run({ y: -1 }, 40).run({ x: 1 }, 400, true);
    expect(w.area.def.id).toBe('sunken_promenade');
    w.run({}, 60);
    expect(w.body.grounded).toBe(true);
    expect(w.tile[1]).toBe(23);
    expect(w.tile[0]).toBeLessThan(3);
  });

  it('遊歩道から西へ戻ると寝室に入る', () => {
    const w = new Walker('sunken_promenade', { kind: 'tile', tile: [3, 23] }).run({ x: -1 }, 200, true);
    expect(w.area.def.id).toBe('bed_room');
    expect(w.tile[0]).toBe(19);
    expect([6, 7]).toContain(w.tile[1]); // 東の出口（6〜7 行目）
  });

  it('遊歩道の東端から逆さの水族館へ入ると、上向きの重力で通路の天井に立つ', () => {
    const w = new Walker('sunken_promenade', { kind: 'tile', tile: [87, 23] }).run({ x: 1 }, 120, true);
    expect(w.area.def.id).toBe('inverted_aquarium');
    w.run({}, 200);
    expect(w.body.grounded).toBe(true);
    expect(w.body.y).toBe(20 * TILE);
  });

  it('水族館の通路から西へ戻ると、遊歩道の床に立つ', () => {
    const w = new Walker('inverted_aquarium', { kind: 'tile', tile: [3, 20] }).run({ x: -1 }, 200, true).run({}, 120);
    expect(w.area.def.id).toBe('sunken_promenade');
    expect(w.body.grounded).toBe(true);
    expect(w.body.y + w.body.h).toBe(24 * TILE);
  });

  it('水族館の通路を抜けると、天井へ「落ちる」', () => {
    const w = new Walker('inverted_aquarium', { kind: 'tile', tile: [3, 20] }).run({ x: 1 }, 90).run({}, 400);
    expect(w.area.def.id).toBe('inverted_aquarium');
    expect(w.body.grounded).toBe(true);
    expect(w.body.y).toBeLessThan(19 * TILE); // 通路（20 行目）より上の足場の下面に立っている
  });

  it('寝室のベッドは通り抜けられない（置いた物の当たり判定）', () => {
    // ベッド（2 列目、10〜11 行目）の右側から左へ歩く
    const w = new Walker('bed_room', { kind: 'tile', tile: [5, 11] }).run({ x: -1 }, 120);
    expect(w.body.x).toBeGreaterThanOrEqual(3 * TILE);
  });

  it('終わらない野原は端がループし、エリアは変わらない', () => {
    const w = new Walker('endless_field', { kind: 'tile', tile: [18, 12] });
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
