import type { Check } from './check';

/** tools/atlas/checks/ の検査を自動で登録する（ファイル名の順） */
const files = import.meta.glob<Check>('./checks/*.ts', { eager: true, import: 'default' });

export const checks: Check[] = Object.keys(files)
  .sort()
  .map((path) => files[path]!);
