import { finding, type Check } from '../check';

/** ループする辺に隣のエリアが接している（L1）。ゲームはループを優先するので、隣へは出られない */
export default {
  id: 'wrap_border',
  run({ borders, name }) {
    return borders
      .filter((b) => b.wrapped.length)
      .map((b) => {
        const other = b.wrapped.includes(b.a) ? b.b : b.a;
        const looped = b.wrapped.map((id) => `「${name(id)}」`).join('と');
        return finding('wrap_border', 'yellow', {
          nodes: [`area:${b.a}`, `area:${b.b}`],
          text: `${looped}の${b.axis === 'x' ? '左右' : '上下'}の端はループするので、接している「${name(other)}」へは出られない`,
          fix: ['ループをやめる', 'ワープか出入口でつなぐ', '地図で離して置く'],
        });
      });
  },
} satisfies Check;
