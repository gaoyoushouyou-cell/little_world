import { nextStageCost, stageOf, storageOf, upgrade, warpTargets } from '../../systems/bases';
import { canPay, countItem } from '../../systems/inventory';
import type { CostLine } from '../../systems/inventory';
import type { PlacedObject } from '../../engine/content';
import type { MenuItem } from '../../ui/ui';
import type { GameServices } from './_types';

/** 拠点で使える機能の一覧（ベッドと拠点の核で共通） */

const STAGE_NOTE: Record<number, string> = {
  1: 'ベッド（眠り直しの起点）と倉庫',
  2: '拠点どうしの移動、夢の回廊（倉庫の共有）',
  3: '素材の加工、展示棚（まだ作っていない）',
  4: '住人を招く（まだ作っていない）',
};

export function costLines(s: GameServices, cost: CostLine[], sources = [s.save.data.pocket]): { text: string; ok: boolean }[] {
  return cost.map((c) => {
    const have = sources.reduce((n, slots) => n + countItem(slots, c.item, c.minQuality), 0);
    const name = s.content.items.get(c.item)?.name ?? c.item;
    const q = c.minQuality > 1 ? `（質 ${c.minQuality} 以上）` : '';
    return { text: `${name}${q}  ${Math.min(have, c.count)} / ${c.count}`, ok: have >= c.count };
  });
}

export function openStorage(s: GameServices, area: string, onClose?: () => void): void {
  const storage = storageOf(s.save.data, area, s.content.economy);
  const corridor = stageOf(s.save.data, area) >= 2;
  s.ui.storage(
    { title: '手持ち', slots: s.save.data.pocket, showWeight: true },
    { title: corridor ? '夢の回廊（共有の倉庫）' : '倉庫', slots: storage },
    () => s.save.save(),
    onClose,
  );
}

export function baseMenu(s: GameServices, area: string, opts: { sleepFirst: boolean; bed?: PlacedObject }): void {
  const base = s.content.bases.get(area);
  if (!base) return;
  const save = s.save.data;
  const stage = stageOf(save, area);
  const items: MenuItem[] = [];
  const sleep: MenuItem = { label: '眠る', detail: ['ここで目覚めるようにして、記録する'], run: () => s.sleep(area, opts.bed) };
  if (opts.sleepFirst) items.push(sleep);
  items.push({ label: '倉庫を開く', run: () => openStorage(s, area) });
  if (!opts.sleepFirst) items.push(sleep);

  const targets = warpTargets(save, [...s.content.bases.values()], area);
  if (stage >= 2) {
    items.push({
      label: '拠点へ移動',
      disabled: targets.length === 0,
      detail: targets.length ? undefined : ['段階2以上の拠点がほかにない'],
      run: () =>
        s.ui.menu(
          '移動する拠点',
          targets.map((t) => ({ label: s.content.areas.get(t.area)?.name ?? t.area, run: () => s.travelToBase(t.area) })),
        ),
    });
  }

  const next = nextStageCost(base, save, [...s.content.bases.values()], s.content.economy);
  if (next) {
    const sources = [save.pocket, storageOf(save, area, s.content.economy)];
    const lines = costLines(s, next.cost, sources);
    items.push({
      label: `段階 ${next.stage} にする`,
      detail: [`できること：${STAGE_NOTE[next.stage] ?? ''}`, ...lines.map((l) => (l.ok ? '✓ ' : '× ') + l.text)],
      disabled: !canPay(sources, next.cost),
      run: () => {
        if (upgrade(base, save, [...s.content.bases.values()], s.content.economy, sources)) {
          s.save.save();
          s.ui.close();
          s.ui.toast(`拠点が段階 ${next.stage} になった`);
        }
      },
    });
  }
  const name = s.content.areas.get(area)?.name ?? area;
  s.ui.menu(`拠点：${name}`, items, `段階 ${stage}`);
}
