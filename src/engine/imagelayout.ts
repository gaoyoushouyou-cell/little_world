import { VIEW_H } from './constants';

/**
 * 画像レイヤーの置き方の計算（Phaser に依存しない）。
 * 描画（plugins/layers/image.ts）と描画の検証（rendercheck.ts）の両方がこれを使い、
 * 「画面のどのドットに、絵のどのドットが来るか」を決める。
 */

export interface ImageLayoutParams {
  scroll: number;
  baseline: number;
  offsetY: number;
  repeatX: boolean;
  /** 繰り返さないときの左端（画面の px、カメラが左端のとき） */
  x: number;
  scale: number;
  autoScroll: [number, number];
}

export interface ImagePlacement {
  /** 拡大した後の絵の大きさ（画面の px） */
  w: number;
  h: number;
  /** 画面の上端から絵の上端まで */
  y: number;
  repeat: boolean;
  /** repeat のとき、画面の左端に来る（拡大した後の）絵の列。tileSprite の tilePositionX */
  shift: number;
  /** repeat でないときの画面の左端からの位置 */
  x: number;
  scale: number;
}

/**
 * 縦は影絵（silhouette）と同じ決まり：カメラが一番下にあるとき、絵の下端がエリアの高さ × baseline に来る。
 * 横は scroll の速さでカメラに付いて動き、autoScroll（px/秒）でひとりでに流れる
 */
export function placeImage(
  p: ImageLayoutParams,
  image: { width: number; height: number },
  areaHeightPx: number,
  cam: { scrollX: number; scrollY: number },
  timeMs: number,
): ImagePlacement {
  const w = image.width * p.scale;
  const h = image.height * p.scale;
  const camMaxY = Math.max(0, areaHeightPx - VIEW_H);
  const bottom = areaHeightPx * p.baseline - camMaxY * (1 - p.scroll) + p.offsetY;
  const drift = (p.autoScroll[0] * timeMs) / 1000;
  return {
    w,
    h,
    y: Math.round(bottom - cam.scrollY * p.scroll - h),
    repeat: p.repeatX,
    shift: Math.round(cam.scrollX * p.scroll + drift),
    x: Math.round(p.x - cam.scrollX * p.scroll + drift),
    scale: p.scale,
  };
}

/** 画面のドット (sx, sy) に来る絵のドット [列, 行]。絵の外なら null */
export function sourcePixelAt(pl: ImagePlacement, sx: number, sy: number): [number, number] | null {
  const dy = sy - pl.y;
  if (dy < 0 || dy >= pl.h) return null;
  let col: number;
  if (pl.repeat) {
    col = (((sx + pl.shift) % pl.w) + pl.w) % pl.w;
  } else {
    col = sx - pl.x;
    if (col < 0 || col >= pl.w) return null;
  }
  return [Math.floor(col / pl.scale), Math.floor(dy / pl.scale)];
}
