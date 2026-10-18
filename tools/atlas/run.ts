/// <reference types="node" />
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pngjs from 'pngjs';
import { Content } from '../../src/engine/content';
import { areaMosaic, type Mosaic } from '../../src/systems/mapview';
import { decodePngFile } from '../lib/png-file';
import { buildAtlas } from './build';
import { Atlas } from './schema';

/**
 * content を読み、解析して planning/out/ に書き出す。
 * import.meta.glob を使う Content を読むので、Vite のモジュールランナーの中で動かす（入口は index.ts）。
 */

export interface RunOptions {
  /** リポジトリの場所 */
  root: string;
  git: Atlas['git'];
}

export async function runAtlas({ root, git }: RunOptions): Promise<Atlas> {
  const content = new Content({ decodeImage: decodePngFile });
  for (const placed of content.world.all()) await content.loadArea(placed.id).catch(() => undefined);
  const atlas = buildAtlas(content, { git });

  const out = join(root, 'planning', 'out');
  mkdirSync(join(out, 'mosaic'), { recursive: true });
  for (const node of atlas.nodes) {
    if (node.kind !== 'area') continue;
    const loaded = content.getLoaded(node.id.slice(5));
    if (!loaded) continue;
    const file = `mosaic/${loaded.def.id}.png`;
    writeAtomic(join(out, file), mosaicPng(areaMosaic(loaded, (t) => content.tiles.get(t)?.color)));
    node.mosaic = file;
  }

  Atlas.parse(atlas);
  writeAtomic(join(out, 'atlas.json'), JSON.stringify(atlas, null, 2) + '\n');
  rmSync(join(out, 'atlas.error.txt'), { force: true });
  return atlas;
}

/** 書きかけを読まれないよう、一時ファイルに書いてから名前を変える */
function writeAtomic(file: string, data: string | Buffer) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

/** モザイク 1 マス = 1 ドットの PNG（何もないマスは透明） */
function mosaicPng(m: Mosaic): Buffer {
  const png = new pngjs.PNG({ width: m.w, height: m.h });
  m.cells.forEach((c, i) => {
    const rgb = c ? hexToRgb(c) : null;
    png.data.set(rgb ? [...rgb, 255] : [0, 0, 0, 0], i * 4);
  });
  return pngjs.PNG.sync.write(png);
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
