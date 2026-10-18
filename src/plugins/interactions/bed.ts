import { z } from 'zod';
import { defineInteraction } from './_types';
import { baseMenu } from './_baseMenu';
import { stageOf } from '../../systems/bases';

/** ベッド：拠点の中なら、眠る・倉庫・拠点の段階などの一覧を開く */
export default defineInteraction({
  type: 'bed',
  params: z.looseObject({ label: z.string().default('眠る') }),
  label(s, _obj, p) {
    return stageOf(s.save.data, s.area.def.id) > 0 ? p.label : null;
  },
  run(s, obj) {
    baseMenu(s, s.area.def.id, { sleepFirst: true, bed: obj });
  },
});
