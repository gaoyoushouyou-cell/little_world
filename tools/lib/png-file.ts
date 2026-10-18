/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import type { ImageDecoder } from '../../src/engine/images';

/**
 * ブラウザの代わりに、PNG をファイルから読む（Node で Content を使うとき。テストと地図帳の解析で共有）。
 * URL は "/content/assets/images/…png" か、Vite が付ける "/@fs/<絶対パス>"。
 */
const root = fileURLToPath(new URL('../..', import.meta.url));

export const decodePngFile: ImageDecoder = async (url) => {
  const path = url.split('?')[0]!;
  const file = path.startsWith('/@fs/') ? path.slice(4) : join(root, path);
  const png = pngjs.PNG.sync.read(readFileSync(file));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};
