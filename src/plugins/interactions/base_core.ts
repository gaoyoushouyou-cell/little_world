import { z } from 'zod';
import { defineInteraction } from './_types';
import { baseMenu, costLines } from './_baseMenu';
import { nextStageCost, stageOf, upgrade } from '../../systems/bases';
import { canPay } from '../../systems/inventory';

/**
 * 拠点の核：まだ拠点でなければ、費用を見せて拠点にする。拠点なら拠点の一覧を開く。
 * 拠点にする費用は手持ちから払う（まだ倉庫がないので）。
 */
export default defineInteraction({
  type: 'base_core',
  params: z.looseObject({ label: z.string().default('調べる') }),
  label(s, _obj, p) {
    return s.content.bases.has(s.area.def.id) ? p.label : null;
  },
  run(s) {
    const area = s.area.def.id;
    const save = s.save.data;
    const base = s.content.bases.get(area)!;
    if (stageOf(save, area) > 0) {
      baseMenu(s, area, { sleepFirst: false });
      return;
    }
    const defs = [...s.content.bases.values()];
    const next = nextStageCost(base, save, defs, s.content.economy);
    if (!next) return;
    const lines = costLines(s, next.cost);
    s.ui.menu(
      'ここを拠点にする',
      [
        {
          label: '拠点にする',
          detail: ['ベッド（眠り直しの起点）と倉庫が使えるようになる', ...lines.map((l) => (l.ok ? '✓ ' : '× ') + l.text)],
          disabled: !canPay([save.pocket], next.cost),
          run: () => {
            if (upgrade(base, save, defs, s.content.economy, [save.pocket])) {
              s.save.save();
              s.ui.close();
              s.ui.toast('ここが拠点になった');
            }
          },
        },
        { label: 'やめる', run: () => s.ui.close() },
      ],
      '誰も座っていない椅子がある',
    );
  },
});
