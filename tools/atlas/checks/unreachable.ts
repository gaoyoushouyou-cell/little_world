import { finding, type Check } from '../check';

/** 起点からどの辺をたどっても行けないエリア（L1）。孤立したエリアは isolated だけが出す */
export default {
  id: 'unreachable',
  run({ nodes, name }) {
    return nodes
      .filter((n) => n.kind === 'area' && n.reach === 'unreachable')
      .map((n) =>
        finding('unreachable', 'red', {
          nodes: [n.id],
          text: `「${name(n.id.slice(5))}」には起点から行けない`,
          fix: ['起点の側から入る道（口・ワープ・出入口）を足す'],
        }),
      );
  },
} satisfies Check;
