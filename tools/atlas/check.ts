import type { Border, Landing } from './openings';
import type { AtlasEdge, AtlasNode, Finding, Severity } from './schema';
import type { AtlasSource } from './source';

/**
 * 検査のプラグイン。tools/atlas/checks/<id>.ts に 1 種類 1 ファイルで置くと自動で登録される。
 */
export interface CheckContext {
  src: AtlasSource;
  /** 起点のノード ID */
  start: string;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  borders: Border[];
  landings: Landing[];
  /** エリア ID → 表示名（「沈んだ遊歩道」） */
  name(areaId: string): string;
}

export interface Check {
  id: string;
  run(ctx: CheckContext): Finding[];
}

/** 検査の結果を作る。key は「検査の名前:対象」（subject を省くとノードと辺の ID を並べる） */
export function finding(
  check: string,
  severity: Severity,
  o: { nodes?: string[]; edges?: string[]; subject?: string; text: string; fix?: string[] },
): Finding {
  const nodes = o.nodes ?? [];
  const edges = o.edges ?? [];
  return {
    key: `${check}:${o.subject ?? [...nodes, ...edges].join(',')}`,
    check,
    severity,
    nodes,
    edges,
    text: o.text,
    ...(o.fix ? { fix: o.fix } : {}),
  };
}
