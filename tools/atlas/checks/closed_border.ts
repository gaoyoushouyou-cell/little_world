import { finding, type Check } from '../check';

/** 地図では接しているのに、通れるマスが 1 つもない境界（L1） */
export default {
  id: 'closed_border',
  run({ borders, name }) {
    return borders
      .filter((b) => !b.wrapped.length && !b.openings.length)
      .map((b) =>
        finding('closed_border', 'info', {
          nodes: [`area:${b.a}`, `area:${b.b}`],
          text: `「${name(b.a)}」と「${name(b.b)}」は地図では接しているが、通れる所がない`,
          fix: ['意図した壁なら何もしない', '境界の両側のマスを空ける'],
        }),
      );
  },
} satisfies Check;
