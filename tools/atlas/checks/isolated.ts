import { finding, type Check } from '../check';

/** 出入りする辺が 1 本もないエリア（L0） */
export default {
  id: 'isolated',
  run({ nodes, name }) {
    return nodes
      .filter((n) => n.kind === 'area' && n.reach === 'isolated')
      .map((n) =>
        finding('isolated', 'red', {
          nodes: [n.id],
          text: `「${name(n.id.slice(5))}」はどこともつながっていない`,
          fix: ['地図で端を接して、通れる口を作る', 'ワープか出入口を足す'],
        }),
      );
  },
} satisfies Check;
