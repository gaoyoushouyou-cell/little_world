/// <reference types="node" />
/**
 * 開発の地図帳の解析（docs/design/14_dev_atlas.md 13.2）。
 *
 *   node tools/atlas/index.ts            1 回解析して planning/out/atlas.json を書く。赤があれば終了コード 1
 *   node tools/atlas/index.ts --watch    content/ の変更を監視して書き直し続ける（MindBloom が起動する）
 *   node tools/atlas/index.ts --quiet    要約を出さない
 *
 * Content は Vite の import.meta.glob で content を読むので、Vite をプログラムから起動し、
 * そのモジュールランナーで run.ts を読み込む（ゲームと同じ検証・同じプラグインの登録になる）。
 * このファイルは素の node で動くので、ほかの .ts を直接 import しない（型だけは使える）。
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createServer, isRunnableDevEnvironment } from 'vite';
import type { RunOptions } from './run';
import type { Atlas } from './schema';

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const quiet = args.includes('--quiet');
const root = join(import.meta.dirname, '..', '..');
const out = join(root, 'planning', 'out');

const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: watch ? { ignored: ['**/planning/**', '**/dist/**', '**/node_modules/**'] } : null },
});
const env = server.environments.ssr;
if (!isRunnableDevEnvironment(env)) throw new Error('Vite の ssr 環境でモジュールを動かせない');
const runner = env.runner;

function gitInfo(): Atlas['git'] {
  try {
    const commit = execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() !== '';
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: false };
  }
}

function summary(atlas: Atlas) {
  const { stats } = atlas;
  const f = stats.findings;
  console.log(`地図帳：エリア ${stats.areas}・口 ${atlas.openings.length}・赤 ${f.red} / 黄 ${f.yellow} / 情報 ${f.info}`);
  for (const x of atlas.findings) {
    if (x.severity === 'info') continue;
    console.log(`  ${x.severity === 'red' ? '✕ 赤' : '⚠ 黄'}  ${x.text}`);
  }
  console.log(`  → ${relative(root, join(out, 'atlas.json')).split(sep).join('/')}`);
}

/** 1 回解析する。赤の数を返す（失敗したら -1） */
async function once(): Promise<number> {
  try {
    const mod = (await runner.import('/tools/atlas/run.ts')) as { runAtlas(o: RunOptions): Promise<Atlas> };
    const atlas = await mod.runAtlas({ root, git: gitInfo() });
    if (!quiet) summary(atlas);
    else console.log(`atlas: ok ${atlas.generatedAt} red=${atlas.stats.findings.red}`);
    return atlas.stats.findings.red;
  } catch (e) {
    const message = e instanceof Error ? (e.stack ?? e.message) : String(e);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'atlas.error.txt'), `${new Date().toISOString()}\n${message}\n`);
    console.error(`atlas: 解析に失敗した\n${message}`);
    return -1;
  }
}

if (!watch) {
  const red = await once();
  await server.close();
  process.exit(red === 0 ? 0 : 1);
}

await once();
console.log('atlas: content/ を監視しています（Ctrl+C で終わる）');
let timer: ReturnType<typeof setTimeout> | undefined;
server.watcher.on('all', (_event, path) => {
  const rel = relative(root, path).split(sep).join('/');
  if (!/^(content|src|tools\/atlas|tools\/lib)\//.test(rel)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    env.moduleGraph.invalidateAll();
    runner.clearCache();
    void once();
  }, 300);
});
