/// <reference types="node" />
/**
 * art/ の原画を、ゲームが読むデータ（パレット + 文字グリッド）に加工する。
 *
 *   node tools/import-art.ts scan <画像> [背景]     画像の中の物の範囲と、1ドットの大きさの見当を出す
 *   node tools/import-art.ts build                  content/assets/import-manifest.json のとおりに加工する
 *   node tools/import-art.ts preview <出力.png> [id...]  加工したタイル・スプライトを並べた確認用の画像を作る
 *   node tools/import-art.ts crop <画像> x y 幅 高さ <出力.png> [倍率]  元画像の一部を書き出す（切り抜き範囲を決めるとき）
 *
 * 背景の指定：magenta（#FF00FF とその近く）/ alpha（透明）/ none / #rrggbb（その色の近く）/ auto
 * art/ の中のファイルは読むだけで、書き換えない。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import pngjs from 'pngjs';
import jpeg from 'jpeg-js';

const { PNG } = pngjs;
const ROOT = join(import.meta.dirname, '..');
const MANIFEST = join(ROOT, 'content/assets/import-manifest.json');
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// ---- 画像の読み書き ----------------------------------------------------

interface Img {
  w: number;
  h: number;
  data: Uint8Array;
}

function loadImage(path: string): Img {
  const buf = readFileSync(join(ROOT, path));
  if (/\.jpe?g$/i.test(path)) {
    const j = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 1024 });
    return { w: j.width, h: j.height, data: j.data };
  }
  const p = PNG.sync.read(buf);
  return { w: p.width, h: p.height, data: new Uint8Array(p.data) };
}

function savePng(path: string, img: Img): void {
  const png = new PNG({ width: img.w, height: img.h });
  png.data = Buffer.from(img.data);
  writeFileSync(path, PNG.sync.write(png));
}

// ---- 背景の判定 --------------------------------------------------------

type Bg = 'magenta' | 'alpha' | 'none' | 'auto' | string;
type BgTest = (r: number, g: number, b: number, a: number) => boolean;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const isMagenta: BgTest = (r, g, b, a) => a < 128 || (r > 130 && b > 130 && g < 0.55 * Math.min(r, b));

function bgTest(img: Img, bg: Bg, tolerance = 28): BgTest {
  if (bg === 'magenta') return isMagenta;
  if (bg === 'alpha') return (_r, _g, _b, a) => a < 128;
  if (bg === 'none') return () => false;
  if (bg.startsWith('#')) {
    // "#aaaaaa,#bbbbbb" のように複数（市松模様の背景など）も指定できる
    const colors = bg.split(',').map((c) => hexRgb(c.trim()));
    return (r, g, b, a) => a < 128 || colors.some(([R, G, B]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) < tolerance * 3);
  }
  // auto：四隅を見て決める
  const corners = [0, img.w - 1, (img.h - 1) * img.w, img.h * img.w - 1].map((i) => [...img.data.subarray(i * 4, i * 4 + 4)]);
  if (corners.some((c) => c[3]! < 128)) return bgTest(img, 'alpha');
  if (corners.every((c) => isMagenta(c[0]!, c[1]!, c[2]!, c[3]!))) return isMagenta;
  const c = corners[0]!;
  return bgTest(img, `#${((c[0]! << 16) | (c[1]! << 8) | c[2]!).toString(16).padStart(6, '0')}`, tolerance);
}

function mask(img: Img, test: BgTest): Uint8Array {
  const m = new Uint8Array(img.w * img.h);
  for (let i = 0; i < img.w * img.h; i++) {
    const o = i * 4;
    m[i] = test(img.data[o]!, img.data[o + 1]!, img.data[o + 2]!, img.data[o + 3]!) ? 0 : 1;
  }
  return m;
}

// ---- scan：物の範囲と1ドットの大きさ ---------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
}

function components(img: Img, m: Uint8Array, minPixels: number, gap: number): Box[] {
  const seen = new Uint8Array(m.length);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < m.length; start++) {
    if (!m[start] || seen[start]) continue;
    let x0 = img.w, y0 = img.h, x1 = 0, y1 = 0, n = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % img.w;
      const y = (i - x) / img.w;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) continue;
          const j = ny * img.w + nx;
          if (m[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }
  // 近いものをまとめる（離れた葉や影を1つの物にする）
  let merged = true;
  let list = boxes.filter((b) => b.n >= 4);
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        if (a.x - gap <= b.x + b.w && b.x - gap <= a.x + a.w && a.y - gap <= b.y + b.h && b.y - gap <= a.y + a.h) {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          list[i] = { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y, n: a.n + b.n };
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  list = list.filter((b) => b.n >= minPixels);
  return list.sort((a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y));
}

/** 色の変わり目がそろう間隔から、1ドットの大きさ（px）の見当を出す */
function estimateBlock(img: Img, box: Box): { x: number[]; y: number[] } {
  const q = (i: number) => ((img.data[i]! >> 4) << 8) | ((img.data[i + 1]! >> 4) << 4) | (img.data[i + 2]! >> 4);
  const edgesX = new Float64Array(box.w);
  const edgesY = new Float64Array(box.h);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w - 1; x++) {
      const i = (y * img.w + x) * 4;
      if (q(i) !== q(i + 4)) edgesX[x - box.x + 1]! += 1;
    }
  }
  for (let x = box.x; x < box.x + box.w; x++) {
    for (let y = box.y; y < box.y + box.h - 1; y++) {
      const i = (y * img.w + x) * 4;
      if (q(i) !== q(i + img.w * 4)) edgesY[y - box.y + 1]! += 1;
    }
  }
  // 変わり目が s px ごとにそろうほど点が高い。s の倍数も同じくらい高くなるので、
  // 最高点の 85% 以上を取る中で一番小さい s を選ぶ。原寸の絵なら 1
  const best = (edges: Float64Array) => {
    const total = edges.reduce((s, v) => s + v, 0) || 1;
    const scores: [number, number][] = [[1, 1]];
    for (let s = 2; s <= Math.min(48, Math.floor(edges.length / 6)); s++) {
      let bestFrac = 0;
      for (let phase = 0; phase < s; phase++) {
        let sum = 0;
        for (let p = phase; p < edges.length; p += s) sum += edges[p]! + (edges[p - 1] ?? 0) * 0.5 + (edges[p + 1] ?? 0) * 0.5;
        bestFrac = Math.max(bestFrac, sum / total);
      }
      scores.push([s, bestFrac / Math.min(1, 2 / s)]);
    }
    const top = Math.max(...scores.map(([, v]) => v));
    const pick = top < 1.6 ? 1 : scores.find(([, v]) => v >= top * 0.85)![0];
    const others = scores
      .filter(([s]) => s !== pick)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([s]) => s);
    return [pick, ...others];
  };
  return { x: best(edgesX), y: best(edgesY) };
}

function scan(path: string, bg: Bg, gap?: number): void {
  const img = loadImage(path);
  const m = mask(img, bgTest(img, bg));
  const minPixels = Math.max(30, Math.round((img.w * img.h) / 5000));
  const boxes = components(img, m, minPixels, gap ?? Math.max(4, Math.round(img.w / 120)));
  console.log(`${path}: ${img.w}x${img.h}, 物 ${boxes.length} 個`);
  boxes.forEach((b, i) => {
    const est = estimateBlock(img, b);
    console.log(`  [${i}] crop [${b.x}, ${b.y}, ${b.w}, ${b.h}]  画素 ${b.n}  1ドットの候補 横 ${est.x.join('/')} 縦 ${est.y.join('/')}`);
  });
}

// ---- 減色 --------------------------------------------------------------

function kmeans(samples: number[][], k: number): number[][] {
  if (samples.length === 0) return [];
  let seed = 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const d2 = (a: number[], b: number[]) => (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;
  const centers: number[][] = [samples[Math.floor(rnd() * samples.length)]!.slice()];
  while (centers.length < k) {
    const dist = samples.map((s) => Math.min(...centers.map((c) => d2(s, c))));
    const total = dist.reduce((a, b) => a + b, 0);
    if (total === 0) break;
    let r = rnd() * total;
    let idx = 0;
    while (idx < dist.length - 1 && (r -= dist[idx]!) > 0) idx++;
    centers.push(samples[idx]!.slice());
  }
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = d2(s, c);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const t = sums[bi]!;
      t[0]! += s[0]!;
      t[1]! += s[1]!;
      t[2]! += s[2]!;
      t[3]! += 1;
    }
    sums.forEach((t, i) => {
      if (t[3]! > 0) centers[i] = [t[0]! / t[3]!, t[1]! / t[3]!, t[2]! / t[3]!];
    });
  }
  return centers.map((c) => c.map((v) => Math.round(v)));
}

function nearest(centers: number[][], r: number, g: number, b: number): number {
  let bi = 0;
  let bd = Infinity;
  centers.forEach((c, i) => {
    const d = (c[0]! - r) ** 2 + (c[1]! - g) ** 2 + (c[2]! - b) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

// ---- 加工 --------------------------------------------------------------

interface Entry {
  id: string;
  source: string;
  /** [x, y, 幅, 高さ]（元画像の px）。省略すると全体 */
  crop?: [number, number, number, number];
  /** アニメーションのコマ（それぞれの crop）。指定すると crop の代わりに使う */
  frames?: [number, number, number, number][];
  /** 複数のアニメーション（名前 → コマの crop）。すべてのコマで1つのパレットと同じ大きさになる */
  animations?: Record<string, [number, number, number, number][]>;
  bg?: Bg;
  bgTolerance?: number;
  /** 背景のまわりを切り詰める（スプライトの既定は true、タイルは false） */
  trim?: boolean;
  /** 出来上がりの大きさ [幅, 高さ]（ドット） */
  size?: [number, number];
  /** 出来上がりの高さ（ドット）。幅は縦横比から決める */
  height?: number;
  /** 元画像の何 px を1ドットにするか */
  scale?: number;
  colors?: number;
  /** スプライトの1コマあたりのステップ数（60 = 1秒） */
  frameSteps?: number;
  /** タイルだけ */
  solid?: boolean;
  note?: string;
}

interface Manifest {
  tilesets: { out: string; items: Entry[] }[];
  sprites: Entry[];
}

interface Converted {
  palette: Record<string, string | null>;
  frames: string[][];
  mostCommon: string;
}

function convert(e: Entry, isTile: boolean): Converted {
  const img = loadImage(e.source);
  const test = bgTest(img, e.bg ?? (isTile ? 'none' : 'auto'), e.bgTolerance);
  const m = mask(img, test);
  const crops = e.frames ?? [e.crop ?? [0, 0, img.w, img.h]];
  const trim = e.trim ?? !isTile;

  // 切り詰めた範囲（コマが複数ならすべてのコマで同じ大きさにする）
  const regions = crops.map(([cx, cy, cw, ch]) => {
    if (!trim) return { x: cx, y: cy, w: cw, h: ch };
    let x0 = cx + cw, y0 = cy + ch, x1 = cx - 1, y1 = cy - 1;
    for (let y = cy; y < cy + ch; y++) {
      for (let x = cx; x < cx + cw; x++) {
        if (m[y * img.w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < x0 ? { x: cx, y: cy, w: cw, h: ch } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  });
  if (regions.length > 1) {
    // 足元（下端）と左右の中央をそろえて、一番大きい枠に広げる
    const W = Math.max(...regions.map((r) => r.w));
    const H = Math.max(...regions.map((r) => r.h));
    regions.forEach((r) => {
      r.x -= Math.floor((W - r.w) / 2);
      r.y -= H - r.h;
      r.w = W;
      r.h = H;
    });
  }
  const r0 = regions[0]!;
  let [tw, th] = e.size ?? [0, 0];
  if (!e.size) {
    const s = e.scale ?? (e.height ? r0.h / e.height : 1);
    tw = Math.max(1, Math.round(r0.w / s));
    th = Math.max(1, Math.round(r0.h / s));
  }

  // 減色（すべてのコマで1つのパレット）
  const samples: number[][] = [];
  for (const r of regions) {
    const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 20000)));
    for (let y = r.y; y < r.y + r.h; y += step) {
      for (let x = r.x; x < r.x + r.w; x += step) {
        if (x < 0 || y < 0 || x >= img.w || y >= img.h || !m[y * img.w + x]) continue;
        const o = (y * img.w + x) * 4;
        samples.push([img.data[o]!, img.data[o + 1]!, img.data[o + 2]!]);
      }
    }
  }
  const centers = kmeans(samples, e.colors ?? (isTile ? 8 : 16));

  const used = new Map<number, number>();
  const labelFrames = regions.map((r) => {
    const sx = r.w / tw;
    const sy = r.h / th;
    const rows: number[][] = [];
    for (let ty = 0; ty < th; ty++) {
      const row: number[] = [];
      for (let tx = 0; tx < tw; tx++) {
        // ドットの中央付近だけを見て、境目のにじみを避ける
        const x0 = r.x + tx * sx + sx * 0.25;
        const x1 = r.x + (tx + 1) * sx - sx * 0.25;
        const y0 = r.y + ty * sy + sy * 0.25;
        const y1 = r.y + (ty + 1) * sy - sy * 0.25;
        const counts = new Map<number, number>();
        let bgCount = 0;
        let fg = 0;
        for (let y = Math.floor(y0); y <= Math.max(Math.floor(y0), Math.ceil(y1) - 1); y++) {
          for (let x = Math.floor(x0); x <= Math.max(Math.floor(x0), Math.ceil(x1) - 1); x++) {
            if (x < 0 || y < 0 || x >= img.w || y >= img.h) {
              bgCount++;
              continue;
            }
            const i = y * img.w + x;
            if (!m[i]) {
              bgCount++;
              continue;
            }
            fg++;
            const o = i * 4;
            const l = nearest(centers, img.data[o]!, img.data[o + 1]!, img.data[o + 2]!);
            counts.set(l, (counts.get(l) ?? 0) + 1);
          }
        }
        if (bgCount > fg || counts.size === 0) {
          row.push(-1);
          continue;
        }
        let best = -1;
        let bestN = -1;
        for (const [l, n] of counts) {
          if (n > bestN) {
            best = l;
            bestN = n;
          }
        }
        used.set(best, (used.get(best) ?? 0) + 1);
        row.push(best);
      }
      rows.push(row);
    }
    return rows;
  });

  // 使った色だけを、暗い順に文字へ割り当てる
  const lum = (c: number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  const order = [...used.keys()].sort((a, b) => lum(centers[a]!) - lum(centers[b]!));
  const charOf = new Map(order.map((l, i) => [l, CHARS[i]!]));
  const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const palette: Record<string, string | null> = { '.': null };
  for (const l of order) palette[charOf.get(l)!] = hex(centers[l]!);
  const frames = labelFrames.map((rows) => rows.map((row) => row.map((l) => (l < 0 ? '.' : charOf.get(l)!)).join('')));
  const top = [...used.entries()].sort((a, b) => b[1] - a[1])[0];
  return { palette, frames, mostCommon: top ? hex(centers[top[0]]!) : '#000000' };
}

function gridJson(palette: Record<string, string | null>, rows: string[], indent: string): string {
  return (
    `{\n${indent}  "palette": ${JSON.stringify(palette)},\n${indent}  "pixels": [\n` +
    rows.map((r) => `${indent}    "${r}"`).join(',\n') +
    `\n${indent}  ]\n${indent}}`
  );
}

function build(): void {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  for (const set of manifest.tilesets) {
    const parts: string[] = [];
    for (const e of set.items) {
      const c = convert(e, true);
      if (c.frames[0]!.length !== 16 || c.frames[0]![0]!.length !== 16) throw new Error(`${e.id}: タイルは 16×16 にする（size を指定）`);
      if (c.frames[0]!.some((row) => row.includes('.')) && e.solid) console.warn(`  注意: ${e.id} は固いタイルなのに透明なドットがある`);
      parts.push(
        `    "${e.id}": {\n      "solid": ${e.solid ?? false},\n      "color": "${c.mostCommon}",\n      "source": "${e.source}",\n      "art": ${gridJson(c.palette, c.frames[0]!, '      ').trimStart()}\n    }`,
      );
      console.log(`tile   ${set.out}/${e.id}  ${Object.keys(c.palette).length - 1} 色`);
    }
    writeFileSync(join(ROOT, `content/assets/tiles/${set.out}.json`), `{\n  "tiles": {\n${parts.join(',\n')}\n  }\n}\n`);
  }
  for (const e of manifest.sprites) {
    const anims: [string, [number, number, number, number][]][] = e.animations
      ? Object.entries(e.animations)
      : [['idle', e.frames ?? (e.crop ? [e.crop] : [])]];
    const flat = anims.flatMap(([, crops]) => crops);
    const c = convert({ ...e, frames: flat.length ? flat : undefined }, false);
    const w = c.frames[0]![0]!.length;
    const h = c.frames[0]!.length;
    const frameJson = (rows: string[]) => `      [\n${rows.map((r) => `        "${r}"`).join(',\n')}\n      ]`;
    let k = 0;
    const animJson = anims.map(([name, crops]) => {
      const frames = (crops.length ? crops : [null]).map(() => frameJson(c.frames[k++]!));
      return `    "${name}": [\n${frames.join(',\n')}\n    ]`;
    });
    const source = Object.fromEntries(anims.map(([name]) => [name, e.source]));
    const text = `{\n  "palette": ${JSON.stringify(c.palette)},\n  "frameSteps": ${e.frameSteps ?? 12},\n  "source": ${JSON.stringify(source)},\n  "animations": {\n${animJson.join(',\n')}\n  }\n}\n`;
    writeFileSync(join(ROOT, `content/assets/sprites/${e.id}.json`), text);
    console.log(`sprite ${e.id}  ${w}x${h}  ${anims.map(([n, cr]) => `${n}:${cr.length || 1}`).join(' ')}  ${Object.keys(c.palette).length - 1} 色`);
  }
}

// ---- preview：加工した結果を並べた画像 -------------------------------------

function preview(out: string, ids: string[]): void {
  type Item = { id: string; palette: Record<string, string | null>; rows: string[] };
  const items: Item[] = [];
  const tileDir = join(ROOT, 'content/assets/tiles');
  for (const f of readdirSync(tileDir)) {
    const json = JSON.parse(readFileSync(join(tileDir, f), 'utf8')) as { tiles: Record<string, { art?: { palette: Record<string, string | null>; pixels: string[] } }> };
    for (const [id, t] of Object.entries(json.tiles)) if (t.art) items.push({ id, palette: t.art.palette, rows: t.art.pixels });
  }
  const spriteDir = join(ROOT, 'content/assets/sprites');
  for (const f of readdirSync(spriteDir)) {
    const json = JSON.parse(readFileSync(join(spriteDir, f), 'utf8')) as { palette: Record<string, string | null>; animations: Record<string, string[][]> };
    for (const [anim, frames] of Object.entries(json.animations)) {
      frames.forEach((rows, i) => items.push({ id: `${basename(f, '.json')}:${anim}:${i}`, palette: json.palette, rows }));
    }
  }
  const picked = ids.length ? items.filter((it) => ids.some((id) => it.id === id || it.id.startsWith(`${id}:`))) : items;
  const S = 3;
  const pad = 4;
  const maxW = 960;
  // 左から詰めて並べる
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed = picked.map((it) => {
    const w = it.rows[0]!.length * S;
    const h = it.rows.length * S;
    if (x + w + pad > maxW) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    const p = { it, x, y };
    x += w + pad;
    rowH = Math.max(rowH, h);
    return p;
  });
  const W = maxW;
  const H = y + rowH + pad;
  const img: Img = { w: W, h: H, data: new Uint8Array(W * H * 4) };
  for (let i = 0; i < W * H; i++) {
    const px = i % W;
    const py = Math.floor(i / W);
    const v = ((px >> 3) + (py >> 3)) % 2 ? 40 : 52;
    img.data.set([v, v - 6, v + 10, 255], i * 4);
  }
  for (const { it, x: ox, y: oy } of placed) {
    it.rows.forEach((row, ry) => {
      [...row].forEach((ch, rx) => {
        const c = it.palette[ch];
        if (!c) return;
        const [r, g, b] = hexRgb(c);
        for (let dy = 0; dy < S; dy++) {
          for (let dx = 0; dx < S; dx++) {
            img.data.set([r, g, b, 255], ((oy + ry * S + dy) * W + ox + rx * S + dx) * 4);
          }
        }
      });
    });
  }
  savePng(out, img);
  console.log(`${out}: ${picked.length} 個`);
  placed.forEach(({ it, x: px, y: py }) => console.log(`  ${it.id} @ (${px}, ${py})`));
}

// ---- crop：元画像の一部を拡大して書き出す（切り抜き範囲を決めるための確認用） -------------

function cropOut(path: string, x: number, y: number, w: number, h: number, out: string, zoom: number): void {
  const img = loadImage(path);
  const o: Img = { w: w * zoom, h: h * zoom, data: new Uint8Array(w * zoom * h * zoom * 4) };
  for (let yy = 0; yy < h * zoom; yy++) {
    for (let xx = 0; xx < w * zoom; xx++) {
      const sx = Math.min(img.w - 1, x + Math.floor(xx / zoom));
      const sy = Math.min(img.h - 1, y + Math.floor(yy / zoom));
      o.data.set(img.data.subarray((sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4), (yy * o.w + xx) * 4);
    }
  }
  savePng(out, o);
  console.log(`${out}: ${o.w}x${o.h}`);
}

// ---- 入口 --------------------------------------------------------------

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'scan' && args[0]) scan(args[0], args[1] ?? 'auto', args[2] ? Number(args[2]) : undefined);
else if (cmd === 'build') {
  if (!existsSync(MANIFEST)) throw new Error('content/assets/import-manifest.json がない');
  build();
} else if (cmd === 'preview' && args[0]) preview(args[0], args.slice(1));
else if (cmd === 'crop' && args.length >= 6) {
  const [p, x, y, w, h, out, zoom] = args;
  cropOut(p!, Number(x), Number(y), Number(w), Number(h), out!, Number(zoom ?? 1));
}
else console.log('使い方: node tools/import-art.ts scan <画像> [背景] | build | preview <出力.png> [id...]');
