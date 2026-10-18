import { checks } from './checks';
import type { CheckContext } from './check';
import { checkLanding, findBorders, type Landing } from './openings';
import { cutPoints, reachability, reachOf } from './reach';
import type { Atlas, AtlasEdge, AtlasNode, Finding } from './schema';
import type { AtlasSource } from './source';

/**
 * content から地図帳のグラフを組み、検査を走らせる（docs/design/14_dev_atlas.md 13.3〜13.6）。
 * ファイルには書かない（書き出しは run.ts）。
 */

const SEVERITY_ORDER = { red: 0, yellow: 1, info: 2 } as const;
const areaNode = (id: string) => `area:${id}`;

export interface BuildOptions {
  generatedAt?: string;
  git?: Atlas['git'];
}

export function buildAtlas(src: AtlasSource, opts: BuildOptions = {}): Atlas {
  const areaIds = [...src.areas.keys()].sort();
  const start = areaNode(src.map.start.area);
  const name = (id: string) => src.areas.get(id)?.name ?? id;

  // ---- ノード
  const nodes: AtlasNode[] = [{ id: 'world', kind: 'world', label: '世界', attrs: {} }];
  for (const id of areaIds) {
    const def = src.areas.get(id)!;
    const placed = src.world.get(id);
    nodes.push({
      id: areaNode(id),
      kind: 'area',
      parent: 'world',
      label: def.name,
      attrs: {
        depth: def.depth,
        view: def.view,
        size: def.size,
        pos: placed ? [placed.x, placed.y] : null,
        wrap: def.physics.wrap,
        gravity: def.view === 'top' ? [0, 0] : def.physics.gravity,
        resetOnEnter: def.resetOnEnter,
        basable: def.basable,
      },
    });
    const base = src.bases.get(id);
    if (base) {
      nodes.push({
        id: `base:${id}`,
        kind: 'base',
        parent: areaNode(id),
        label: base.initial ? '拠点（最初から）' : '拠点',
        attrs: { initial: !!base.initial, stages: base.stages.length },
      });
    }
  }

  // ---- 辺：境界の口
  const edges: AtlasEdge[] = [];
  const borders = findBorders(src);
  for (const b of borders) {
    for (const o of b.openings) {
      const n = o.id.slice(o.id.lastIndexOf('#') + 1);
      for (const [from, to, key] of [
        [o.a, o.b, 'a>b'],
        [o.b, o.a, 'b>a'],
      ] as const) {
        const pass = o.pass[key];
        if (pass === 'fail') continue;
        edges.push({ id: `adj:${from}>${to}#${n}`, kind: 'adjacent', from: areaNode(from), to: areaNode(to), pass, opening: o.id });
      }
    }
  }

  // ---- 辺：出入口・ワープ、着く位置の安全
  const landings: Landing[] = [];
  const land = (ref: string, area: string, tile: [number, number]) => {
    const l = checkLanding(src, ref, area, tile);
    if (l) landings.push(l);
  };
  for (const id of areaIds) {
    const def = src.areas.get(id)!;
    for (const [spawn, at] of Object.entries(def.spawns)) land(`spawn:${id}/${spawn}`, id, at);
    for (const exit of def.exits) {
      const target = src.areas.get(exit.to);
      const to = target?.spawns[exit.spawn];
      if (!target || !to) continue; // 参照切れは content_issue が出す
      edges.push({ id: `exit:${id}/${exit.id}`, kind: 'exit', from: areaNode(id), to: areaNode(exit.to), at: { from: exit.at, to } });
      land(`exit:${id}/${exit.id}`, id, exit.at);
    }
  }
  for (const warp of src.map.warps) {
    if (!src.areas.has(warp.from.area) || !src.areas.has(warp.to.area)) continue;
    edges.push({ id: `warp:${warp.id}`, kind: 'warp', from: areaNode(warp.from.area), to: areaNode(warp.to.area), at: { from: warp.from.at, to: warp.to.at } });
    if (warp.bidirectional) {
      edges.push({ id: `warp:${warp.id}~back`, kind: 'warp', from: areaNode(warp.to.area), to: areaNode(warp.from.area), at: { from: warp.to.at, to: warp.from.at } });
    }
    land(`warp:${warp.id} の入口`, warp.from.area, warp.from.at);
    land(`warp:${warp.id} の行き先`, warp.to.area, warp.to.at);
  }

  // ---- 辺：目覚め（決定 70。「戻る」の計算には使わない）
  for (const id of areaIds) {
    if (areaNode(id) !== start) edges.push({ id: `wake:${id}`, kind: 'wake', from: areaNode(id), to: start });
  }

  // ---- 到達
  const areaNodes = areaIds.map(areaNode);
  const r = reachability(areaNodes, edges, start);
  for (const n of nodes) {
    if (n.kind === 'area') n.reach = reachOf(n.id, start, Number(n.attrs.depth), r);
  }

  // ---- 検査
  const ctx: CheckContext = { src, start, nodes, edges, borders, landings, name };
  const findings: Finding[] = checks.flatMap((c) => c.run(ctx));
  findings.sort((p, q) => SEVERITY_ORDER[p.severity] - SEVERITY_ORDER[q.severity] || p.check.localeCompare(q.check) || p.key.localeCompare(q.key));

  // ---- 統計
  const links = [
    ...borders.flatMap((b) => b.openings.filter((o) => o.pass['a>b'] !== 'fail' || o.pass['b>a'] !== 'fail').map((o) => ({ id: o.id, a: areaNode(o.a), b: areaNode(o.b) }))),
    ...edges.filter((e) => (e.kind === 'warp' && !e.id.endsWith('~back')) || e.kind === 'exit').map((e) => ({ id: e.id, a: e.from, b: e.to })),
  ];
  const cuts = cutPoints(areaNodes, links);
  const edgeCounts: Record<string, number> = { adjacent: 0, exit: 0, warp: 0 };
  for (const e of edges) if (e.kind !== 'wake') edgeCounts[e.kind] = (edgeCounts[e.kind] ?? 0) + 1;
  const reaches = nodes.filter((n) => n.kind === 'area').map((n) => n.reach);
  const count = (s: Finding['severity']) => findings.filter((f) => f.severity === s).length;

  return {
    version: 1,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    git: opts.git ?? { commit: null, dirty: false },
    start,
    nodes,
    edges,
    openings: borders.flatMap((b) => b.openings),
    findings,
    stats: {
      areas: areaIds.length,
      edges: edgeCounts,
      roundTrip: areaIds.length ? reaches.filter((x) => x === 'start' || x === 'ok').length / areaIds.length : 1,
      oneWay: findings.filter((f) => f.check === 'one_way_link').length,
      articulation: cuts.articulation,
      bridges: cuts.bridges,
      findings: { red: count('red'), yellow: count('yellow'), info: count('info') },
    },
  };
}
