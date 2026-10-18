import type { AtlasEdge, Reach } from './schema';

/**
 * 到達の計算（13.6）と、関節点・橋。
 */

/** 前向きに行けるノードと、起点へ戻れるノード（目覚めの辺は使わない） */
export function reachability(nodes: string[], edges: AtlasEdge[], start: string) {
  const walk = edges.filter((e) => e.kind !== 'wake');
  const bfs = (from: string, next: (n: string) => string[]) => {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      for (const m of next(queue.shift()!)) {
        if (!seen.has(m)) {
          seen.add(m);
          queue.push(m);
        }
      }
    }
    return seen;
  };
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const e of walk) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    inn.set(e.to, [...(inn.get(e.to) ?? []), e.from]);
  }
  const forward = bfs(start, (n) => out.get(n) ?? []);
  const back = bfs(start, (n) => inn.get(n) ?? []);
  const connected = new Set(walk.flatMap((e) => [e.from, e.to]));
  return { forward, back, isolated: (id: string) => !connected.has(id) && nodes.length > 1 };
}

export function reachOf(id: string, start: string, depth: number, r: ReturnType<typeof reachability>): Reach {
  if (id === start) return 'start';
  if (r.isolated(id)) return 'isolated';
  if (!r.forward.has(id)) return 'unreachable';
  if (r.back.has(id)) return 'ok';
  return depth >= 4 ? 'lose' : 'wake';
}

/**
 * 向きを無視した図での関節点と橋（Tarjan）。
 * links は「物理的なつながり」1 本ごと（境界の口は両向きで 1 本、ワープ・出入口は 1 本ずつ）。
 */
export function cutPoints(nodes: string[], links: { id: string; a: string; b: string }[]) {
  const adj = new Map<string, { to: string; link: number }[]>(nodes.map((n) => [n, []]));
  links.forEach((l, i) => {
    if (l.a === l.b) return;
    adj.get(l.a)?.push({ to: l.b, link: i });
    adj.get(l.b)?.push({ to: l.a, link: i });
  });
  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const articulation = new Set<string>();
  const bridges: string[] = [];
  let t = 0;
  const dfs = (u: string, viaLink: number) => {
    order.set(u, t);
    low.set(u, t);
    t++;
    let children = 0;
    for (const { to, link } of adj.get(u) ?? []) {
      if (link === viaLink) continue;
      if (order.has(to)) {
        low.set(u, Math.min(low.get(u)!, order.get(to)!));
        continue;
      }
      children++;
      dfs(to, link);
      low.set(u, Math.min(low.get(u)!, low.get(to)!));
      if (low.get(to)! > order.get(u)!) bridges.push(links[link]!.id);
      if (viaLink !== -1 && low.get(to)! >= order.get(u)!) articulation.add(u);
    }
    if (viaLink === -1 && children > 1) articulation.add(u);
  };
  for (const n of nodes) if (!order.has(n)) dfs(n, -1);
  return { articulation: nodes.filter((n) => articulation.has(n)), bridges: bridges.sort() };
}
