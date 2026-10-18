import { z } from 'zod';
import { defineInteraction } from './_types';
import { stageOf } from '../../systems/bases';

/**
 * 置ける箱（段階 B、決定 59）：箱ごとに自分の中身を持つ。拠点の中でだけ開ける。
 * 開くと手持ちと箱が左右に並ぶ。開いている間は openSprite の見た目になる。
 */
export default defineInteraction({
  type: 'chest',
  params: z.looseObject({
    label: z.string().default('開ける'),
    openSprite: z.string().optional(),
    /** 中身のマス数 */
    slots: z.number().int().positive().default(18),
  }),
  label(s, obj, p) {
    return stageOf(s.save.data, s.area.def.id) > 0 && s.containerOf(obj, p.slots) ? p.label : null;
  },
  run(s, obj, p) {
    const slots = s.containerOf(obj, p.slots);
    if (!slots) return;
    if (p.openSprite) s.setObjectSprite(obj, p.openSprite);
    s.ui.storage(
      { title: '手持ち', slots: s.save.data.pocket, showWeight: true },
      { title: obj.def.name ?? '箱', slots },
      () => s.save.save(),
      () => s.setObjectSprite(obj, null),
    );
  },
});
