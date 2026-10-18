import { finding, type Check } from '../check';

/** 行けるが、歩く・ワープ・出入口では起点に戻れないエリア（L1、決定 70） */
export default {
  id: 'no_walk_back',
  run({ nodes, name }) {
    return nodes
      .filter((n) => n.kind === 'area' && (n.reach === 'wake' || n.reach === 'lose'))
      .map((n) => {
        const depth = Number(n.attrs.depth);
        const lose = n.reach === 'lose';
        return finding('no_walk_back', lose ? 'yellow' : 'info', {
          nodes: [n.id],
          text: `深さ${depth}の「${name(n.id.slice(5))}」から戻るには目覚めるしかない${lose ? '（素材を失う）' : ''}`,
          fix: ['戻りのワープか出入口を足す'],
        });
      });
  },
} satisfies Check;
