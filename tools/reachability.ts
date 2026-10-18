/// <reference types="node" />
/**
 * 到達性チェック（CLAUDE.md の「エリアを足すときの手順」7）。
 * 開発の地図帳の解析（tools/atlas/index.ts）を 1 回走らせ、赤の検査結果があれば終了コード 1 を返す。
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const r = spawnSync(process.execPath, [join(import.meta.dirname, 'atlas', 'index.ts'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
