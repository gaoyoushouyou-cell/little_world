import { z } from 'zod';
import { defineInteraction } from './_types';
import { openCrafting } from './_crafting';

/** 作業台（段階 C、決定 56・64）：拠点の段階に関係なく、手作りと作業台のレシピで加工する */
export default defineInteraction({
  type: 'workbench',
  params: z.looseObject({ label: z.string().default('作る') }),
  label(_s, _obj, p) {
    return p.label;
  },
  run(s) {
    openCrafting(s, 'workbench');
  },
});
