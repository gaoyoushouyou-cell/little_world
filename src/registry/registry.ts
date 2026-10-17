/**
 * プラグインの自動登録。
 * 各プラグインは `src/plugins/<種類>/<名前>.ts` に置き、`export default` で定義を返す。
 * ファイルを置くだけで登録され、中央の一覧を書き換える必要はない。
 * 名前が `_` で始まるファイルは登録しない（共通の下請け処理用）。
 */
export interface Plugin {
  type: string;
}

export class Registry<T extends Plugin> {
  private readonly items = new Map<string, T>();

  constructor(
    readonly kind: string,
    modules: Record<string, { default: T }>,
  ) {
    for (const [path, mod] of Object.entries(modules)) {
      const file = path.split('/').pop() ?? path;
      if (file.startsWith('_')) continue;
      const plugin = mod.default;
      if (!plugin || typeof plugin.type !== 'string') {
        throw new Error(`[${kind}] ${path} が default export でプラグインを返していない`);
      }
      if (this.items.has(plugin.type)) {
        throw new Error(`[${kind}] type "${plugin.type}" が重複している（${path}）`);
      }
      this.items.set(plugin.type, plugin);
    }
  }

  get(type: string): T | undefined {
    return this.items.get(type);
  }

  has(type: string): boolean {
    return this.items.has(type);
  }

  types(): string[] {
    return [...this.items.keys()].sort();
  }
}
