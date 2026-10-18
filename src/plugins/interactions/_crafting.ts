import type { Station } from '../../schema/recipes';
import { canCraft, craft, materialLines, recipesAt } from '../../systems/crafting';
import type { MenuItem } from '../../ui/ui';
import type { GameServices } from './_types';

/**
 * 加工の一覧（段階 C、決定 64〜68）。手作り（C）と作業台で共通。
 * 作れる物が上、材料が足りない物は薄く下。選ぶと材料ごとに「持っている数 / 必要な数」を出す。
 */
export function openCrafting(s: GameServices, station: Station, keep?: string): void {
  const sources = s.craftSources();
  const all = recipesAt(s.content.recipes.values(), station);
  const ordered = [...all.filter((r) => canCraft(r, sources)), ...all.filter((r) => !canCraft(r, sources))];
  const name = (id: string) => s.content.items.get(id)?.name ?? id;

  const items: MenuItem[] = ordered.map((recipe) => {
    const ok = canCraft(recipe, sources);
    const out = s.content.items.get(recipe.output.item);
    const lines = materialLines(recipe, sources).map((l) => {
      const q = l.minQuality > 1 ? `（質 ${l.minQuality} 以上）` : '';
      return `${l.have >= l.need ? '✓' : '×'} ${name(l.item)}${q}  ${Math.min(l.have, l.need)} / ${l.need}`;
    });
    const kind = out?.kind === 'furniture' ? '家具（拠点で B を押して置く）' : '素材（質は材料の一番低い質）';
    return {
      label: `${name(recipe.output.item)}${recipe.output.count > 1 ? ` ×${recipe.output.count}` : ''}${recipe.station === 'workbench' ? '' : '　（手作り）'}`,
      detail: [kind, ...lines],
      disabled: !ok,
      run: () => {
        const r = craft(recipe, s.craftSources(), s.craftOutputs(), (id) => s.content.items.get(id));
        if (!r.ok) {
          s.ui.toast(r.reason);
          return;
        }
        s.save.save();
        s.ui.toast(`${name(recipe.output.item)}${recipe.output.count > 1 ? ` ×${recipe.output.count}` : ''}を作った${r.quality > 1 ? `（質 ${r.quality}）` : ''}`);
        // 同じレシピを選んだまま開き直す（材料が減って並びが変わることがあるので、ID で探す）
        s.ui.close();
        openCrafting(s, station, recipe.id);
      },
    };
  });

  if (items.length === 0) items.push({ label: '作れる物がない', disabled: true, run: () => {} });
  const where = station === 'workbench' ? '作業台' : '手作り';
  const from = sources.length > 1 ? '材料：手持ち・倉庫・このエリアの箱' : '材料：手持ち';
  const start = keep ? ordered.findIndex((r) => r.id === keep) : -1;
  s.ui.menu(where, items, `${from}　作れる物 ${ordered.filter((r) => canCraft(r, sources)).length} / ${ordered.length}`, start >= 0 ? start : undefined);
}
