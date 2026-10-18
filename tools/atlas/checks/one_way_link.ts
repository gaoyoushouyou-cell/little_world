import { finding, type Check } from '../check';

/** 逆向きのないワープ・出入口の一覧（L1。意図を確かめるための情報） */
export default {
  id: 'one_way_link',
  run({ edges, name }) {
    const links = edges.filter((e) => e.kind === 'warp' || e.kind === 'exit');
    return links
      .filter((e) => !links.some((r) => r.from === e.to && r.to === e.from))
      .map((e) =>
        finding('one_way_link', 'info', {
          nodes: [e.from, e.to],
          edges: [e.id],
          subject: e.id,
          text: `${e.kind === 'warp' ? 'ワープ' : '出入口'} ${e.id.slice(e.id.indexOf(':') + 1)}（「${name(e.from.slice(5))}」→「${name(e.to.slice(5))}」）は一方通行`,
        }),
      );
  },
} satisfies Check;
