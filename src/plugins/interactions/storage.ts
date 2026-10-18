import { z } from 'zod';
import { defineInteraction } from './_types';
import { openStorage } from './_baseMenu';
import { stageOf } from '../../systems/bases';

/** 倉庫の箱：拠点の中でだけ開ける。開いている間は openSprite の見た目になる */
export default defineInteraction({
  type: 'storage',
  params: z.looseObject({ label: z.string().default('開ける'), openSprite: z.string().optional() }),
  label(s, _obj, p) {
    return stageOf(s.save.data, s.area.def.id) > 0 ? p.label : null;
  },
  run(s, obj, p) {
    if (p.openSprite) s.setObjectSprite(obj, p.openSprite);
    openStorage(s, s.area.def.id, () => s.setObjectSprite(obj, null));
  },
});
