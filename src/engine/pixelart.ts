import { makeRng } from './rng';
import { TILE } from './constants';
import type { TileDef } from '../schema/assets';

/** 色の明るさを変える（amount: -1〜1） */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

/** パレット + 文字グリッドのドット絵をキャンバスに描く */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  palette: Record<string, string | null>,
  rows: string[],
  ox = 0,
  oy = 0,
): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = palette[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
}

export function gridToCanvas(palette: Record<string, string | null>, rows: string[]): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(rows[0]?.length ?? 1, rows.length);
  drawGrid(ctx, palette, rows);
  return canvas;
}

/**
 * タイル1枚（16×16）を描く。art があればそれを、なければ style から手続き生成する。
 * 段階2で、ドット絵（art）に置き換えていく。
 */
export function drawTile(ctx: CanvasRenderingContext2D, id: string, def: TileDef, ox: number, oy: number): void {
  if (def.art) {
    drawGrid(ctx, def.art.palette, def.art.pixels, ox, oy);
    return;
  }
  const rnd = makeRng(id);
  const base = def.color;
  const accent = def.accent ?? shade(base, 0.35);
  const dark = shade(base, -0.35);
  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, oy + y, w, h);
  };

  switch (def.style) {
    case 'plain':
      rect(0, 0, TILE, TILE, base);
      rect(0, TILE - 1, TILE, 1, dark);
      break;
    case 'speckle':
      rect(0, 0, TILE, TILE, base);
      for (let i = 0; i < 14; i++) px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), rnd() < 0.5 ? dark : accent);
      break;
    case 'brick':
      rect(0, 0, TILE, TILE, base);
      for (let row = 0; row < 4; row++) {
        rect(0, row * 4 + 3, TILE, 1, dark);
        const off = row % 2 === 0 ? 0 : 4;
        for (let x = off; x < TILE; x += 8) rect(x, row * 4, 1, 3, dark);
      }
      px(2, 1, accent);
      px(11, 9, accent);
      break;
    case 'topped':
      rect(0, 0, TILE, TILE, base);
      rect(0, 0, TILE, 3, accent);
      for (let x = 0; x < TILE; x++) if (rnd() < 0.4) px(x, 3, accent);
      for (let i = 0; i < 8; i++) px(Math.floor(rnd() * TILE), 5 + Math.floor(rnd() * 11), dark);
      break;
    case 'plank':
      rect(0, 0, TILE, TILE, base);
      for (let y = 3; y < TILE; y += 4) rect(0, y, TILE, 1, dark);
      for (let i = 0; i < 6; i++) px(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), accent);
      break;
    case 'flower': {
      // 透明な地に小さな花（床の上に重ねる装飾）
      const n = 1 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const cx = 3 + Math.floor(rnd() * 10);
        const cy = 4 + Math.floor(rnd() * 9);
        rect(cx, cy + 1, 1, 3, dark);
        px(cx - 1, cy, base);
        px(cx + 1, cy, base);
        px(cx, cy - 1, base);
        px(cx, cy + 1, base);
        px(cx, cy, accent);
      }
      break;
    }
    case 'boulder':
      rect(3, 2, 10, 12, base);
      rect(2, 4, 12, 9, base);
      rect(4, 3, 4, 2, accent);
      rect(2, 12, 12, 1, dark);
      rect(3, 13, 10, 1, dark);
      break;
    case 'glow':
      rect(2, 2, 12, 12, shade(base, -0.2));
      rect(4, 4, 8, 8, base);
      rect(6, 6, 4, 4, accent);
      break;
  }
}
