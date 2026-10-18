/**
 * content/assets/images/ の PNG（背景・日記の挿絵など、ユーザーの原画から作った大きい絵）。
 * 読み込みは Content が行い（エリアに入るとき、隣のエリアの分も）、ここは形式と解析だけを持つ。
 */

/** RGBA の画素（1 ドット = 4 バイト） */
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface LoadedImage extends PixelImage {
  /** content/assets/images/ からのパス（拡張子なし） */
  id: string;
  /** 使われている不透明な色（#rrggbb、暗い順）。mood で差し替えるときのパレットになる */
  palette: string[];
}

/** URL の PNG を RGBA にする。ブラウザでは decodeInBrowser、テストではファイルを読むものを渡す */
export type ImageDecoder = (url: string) => Promise<PixelImage>;

/** 画像の色数の上限（PIXEL_STYLE 1-8） */
export const MAX_IMAGE_COLORS = 16;

export const imagePath = (id: string) => `/content/assets/images/${id}.png`;

const hex = (r: number, g: number, b: number) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

/** 使われている色と、半透明のドットの数を調べる */
export function analyzeImage(img: PixelImage): { palette: string[]; semiTransparent: number } {
  const colors = new Map<string, number>();
  let semiTransparent = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    const a = img.data[o + 3]!;
    if (a === 0) continue;
    if (a !== 255) semiTransparent++;
    const r = img.data[o]!, g = img.data[o + 1]!, b = img.data[o + 2]!;
    colors.set(hex(r, g, b), 0.299 * r + 0.587 * g + 0.114 * b);
  }
  const palette = [...colors.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
  return { palette, semiTransparent };
}

/** 画像の検証。問題があれば日本語の説明を返す */
export function checkImage(img: PixelImage): string[] {
  const { palette, semiTransparent } = analyzeImage(img);
  const problems: string[] = [];
  if (palette.length > MAX_IMAGE_COLORS) problems.push(`色が ${palette.length} 色ある（${MAX_IMAGE_COLORS} 色以内にする）`);
  if (semiTransparent > 0) problems.push(`半透明のドットが ${semiTransparent} 個ある（不透明か透明のどちらかにする）`);
  return problems;
}

/** ブラウザで PNG を読み、RGBA にする */
export const decodeInBrowser: ImageDecoder = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} を読めない（${res.status}）`);
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, data };
};

/** 整数倍に拡大した RGBA（ぼかさない） */
export function scaleImage(img: PixelImage, scale: number): PixelImage {
  if (scale === 1) return img;
  const w = img.width * scale;
  const h = img.height * scale;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      const s = (sy * img.width + Math.floor(x / scale)) * 4;
      data.set(img.data.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}
