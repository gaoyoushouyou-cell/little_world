import { describe, expect, it } from 'vitest';
import { analyzeImage, checkImage, scaleImage, type PixelImage } from '../src/engine/images';
import { placeImage, sourcePixelAt, type ImageLayoutParams } from '../src/engine/imagelayout';
import { compareFrame, pickBackground, toScreen, type ExpectedFrame, type Rgb, type Screen } from '../src/engine/rendercheck';
import { VIEW_H } from '../src/engine/constants';

/**
 * 画像レイヤーの置き方の計算と、描画の検証（期待する画面と実際の画面の比べ方）。
 * 実際の画面との比較はブラウザで __lw.checkRender() を実行して確かめる。
 */

const base: ImageLayoutParams = { scroll: 0.5, baseline: 1, offsetY: 0, repeatX: true, x: 0, scale: 2, autoScroll: [0, 0] };
const img240 = { width: 240, height: 48 };
const areaH = VIEW_H + 210; // カメラが縦に 210 動けるエリア

describe('画像レイヤーの置き方', () => {
  it('カメラが一番下のとき、baseline 1 の絵の下端は画面の下端に来る', () => {
    const pl = placeImage(base, img240, areaH, { scrollX: 0, scrollY: 210 }, 0);
    expect(pl.h).toBe(96);
    expect(pl.y + pl.h).toBe(VIEW_H);
  });

  it('カメラが上がると、scroll の割合だけ下がる', () => {
    const bottom = placeImage(base, img240, areaH, { scrollX: 0, scrollY: 210 }, 0);
    const top = placeImage(base, img240, areaH, { scrollX: 0, scrollY: 0 }, 0);
    expect(top.y - bottom.y).toBe(105);
  });

  it('横に繰り返す絵は、scroll とひとりでに流れる分だけずれる', () => {
    expect(placeImage(base, img240, areaH, { scrollX: 100, scrollY: 0 }, 0).shift).toBe(50);
    expect(placeImage({ ...base, autoScroll: [10, 0] }, img240, areaH, { scrollX: 100, scrollY: 0 }, 1500).shift).toBe(65);
  });

  it('画面のドットに来る絵のドット（拡大と繰り返しを含む）', () => {
    const pl = placeImage(base, img240, areaH, { scrollX: 100, scrollY: 210 }, 0);
    expect(sourcePixelAt(pl, 0, pl.y)).toEqual([25, 0]);
    expect(sourcePixelAt(pl, 430, pl.y)).toEqual([0, 0]); // 一周して左端に戻る
    expect(sourcePixelAt(pl, 0, pl.y + 95)).toEqual([25, 47]);
    expect(sourcePixelAt(pl, 0, pl.y - 1)).toBeNull();
    expect(sourcePixelAt(pl, 0, pl.y + 96)).toBeNull();
  });

  it('左にはみ出したずれも正しく折り返す', () => {
    const pl = placeImage(base, img240, areaH, { scrollX: -10, scrollY: 210 }, 0);
    expect(sourcePixelAt(pl, 0, pl.y)).toEqual([237, 0]);
  });

  it('繰り返さない絵は x から幅の分だけ描く', () => {
    const pl = placeImage({ ...base, repeatX: false, x: 20 }, img240, areaH, { scrollX: 100, scrollY: 210 }, 0);
    expect(pl.x).toBe(-30);
    expect(sourcePixelAt(pl, 0, pl.y)).toEqual([15, 0]);
    expect(sourcePixelAt(pl, 449, pl.y)).toEqual([239, 0]);
    expect(sourcePixelAt(pl, 450, pl.y)).toBeNull();
  });
});

describe('画像の検証', () => {
  const px = (colors: [number, number, number, number][]): PixelImage => ({ width: colors.length, height: 1, data: new Uint8Array(colors.flat()) });

  it('色を暗い順に集め、半透明のドットを数える', () => {
    const r = analyzeImage(px([[255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 0], [10, 10, 10, 128]]));
    expect(r.palette).toEqual(['#000000', '#0a0a0a', '#ffffff']);
    expect(r.semiTransparent).toBe(1);
  });

  it('17 色以上や半透明は問題として返す', () => {
    const many = px(Array.from({ length: 17 }, (_, i) => [i, 0, 0, 255] as [number, number, number, number]));
    expect(checkImage(many)).toHaveLength(1);
    expect(checkImage(px([[1, 2, 3, 200]]))).toHaveLength(1);
    expect(checkImage(px([[1, 2, 3, 255]]))).toEqual([]);
  });

  it('整数倍の拡大はぼかさない', () => {
    const big = scaleImage(px([[255, 0, 0, 255], [0, 0, 255, 255]]), 2);
    expect(big.width).toBe(4);
    expect([...big.data.subarray(4, 8)]).toEqual([255, 0, 0, 255]);
    expect([...big.data.subarray(8, 12)]).toEqual([0, 0, 255, 255]);
  });
});

describe('描画の検証', () => {
  const red: Rgb = [200, 30, 40];
  const green: Rgb = [0, 255, 0];
  const screenOf = (w: number, h: number, f: (x: number, y: number) => Rgb): Screen => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set([...f(x, y), 255], (y * w + x) * 4);
    return { width: w, height: h, data };
  };
  const onePixel: ExpectedFrame = { colorAt: (x, y) => (x === 1 && y === 0 ? red : null) };

  it('期待どおりの画面なら食い違いはない', () => {
    const r = compareFrame(screenOf(4, 2, (x, y) => (x === 1 && y === 0 ? red : green)), onePixel, green);
    expect(r).toMatchObject({ checked: 8, covered: 1, mismatches: 0 });
  });

  it('1ドットでも違えば、場所と色を報告する', () => {
    const r = compareFrame(screenOf(4, 2, () => green), onePixel, green);
    expect(r.mismatches).toBe(1);
    expect(r.samples[0]).toEqual({ x: 1, y: 0, expected: '#c81e28', actual: '#00ff00' });
  });

  it('拡大して撮った画面をゲームの解像度に戻す', () => {
    const shot = screenOf(8, 4, (x, y) => (Math.floor(x / 2) === 1 && Math.floor(y / 2) === 0 ? red : green));
    expect(compareFrame(toScreen(shot, 4, 2), onePixel, green).mismatches).toBe(0);
    expect(() => toScreen(screenOf(9, 4, () => green), 4, 2)).toThrow();
  });

  it('背景の色はレイヤーの色と重ならないものを選ぶ', () => {
    expect(pickBackground(['#00ff00'])).not.toEqual([0, 255, 0]);
  });

  it('タイルスプライトのずれを、期待する画面との食い違いとして見つけられる', () => {
    // 描画の側を、tileSprite と同じ「画面の x に来るのは絵の (x + tilePositionX) 列目」で別に作る
    const pattern: PixelImage = { width: 16, height: 2, data: new Uint8ClampedArray(16 * 2 * 4) };
    for (let i = 0; i < 32; i++) pattern.data.set([(i % 16) * 15, 40, 90, 255], i * 4);
    const p = { ...base, scale: 2, baseline: 1 };
    const cam = { scrollX: 37, scrollY: 210 };
    const pl = placeImage(p, pattern, areaH, cam, 0);
    const big = scaleImage(pattern, 2);
    const render = (tilePositionX: number) =>
      screenOf(480, VIEW_H, (x, y) => {
        const dy = y - pl.y;
        if (dy < 0 || dy >= big.height) return green;
        const col = (((x + tilePositionX) % big.width) + big.width) % big.width;
        const o = (dy * big.width + col) * 4;
        return [big.data[o]!, big.data[o + 1]!, big.data[o + 2]!];
      });
    const expected: ExpectedFrame = {
      colorAt(sx, sy) {
        const uv = sourcePixelAt(pl, sx, sy);
        if (!uv) return null;
        const o = (uv[1] * pattern.width + uv[0]) * 4;
        return [pattern.data[o]!, pattern.data[o + 1]!, pattern.data[o + 2]!];
      },
    };
    expect(compareFrame(render(pl.shift), expected, green).mismatches).toBe(0);
    expect(compareFrame(render(pl.shift + 1), expected, green).mismatches).toBeGreaterThan(0);
  });
});
