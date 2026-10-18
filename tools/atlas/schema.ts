import { z } from 'zod';
import { IntPair } from '../../src/schema/common';

/**
 * 地図帳の解析の結果（planning/out/atlas.json）。MindBloom はこの形を前提に読む。
 * 形を変えるときは version を上げる（docs/design/14_dev_atlas.md 13.7）。
 */

export const Severity = z.enum(['red', 'yellow', 'info']);
export type Severity = z.infer<typeof Severity>;

/** エリアの到達の状態（13.6） */
export const Reach = z.enum(['start', 'ok', 'wake', 'lose', 'unreachable', 'isolated']);
export type Reach = z.infer<typeof Reach>;

export const Pass = z.enum(['walk', 'jump', 'fail']);
export type Pass = z.infer<typeof Pass>;

export const AtlasNode = z.strictObject({
  id: z.string(),
  kind: z.enum(['world', 'area', 'base']),
  label: z.string(),
  parent: z.string().optional(),
  attrs: z.record(z.string(), z.unknown()).default({}),
  reach: Reach.optional(),
  /** planning/out/ からの PNG のパス（1 マス = 4×4 タイル） */
  mosaic: z.string().optional(),
});
export type AtlasNode = z.infer<typeof AtlasNode>;

export const AtlasEdge = z.strictObject({
  id: z.string(),
  kind: z.enum(['adjacent', 'exit', 'warp', 'wake']),
  from: z.string(),
  to: z.string(),
  /** 境界の口：歩いて越えたか、跳んで越えたか */
  pass: Pass.exclude(['fail']).optional(),
  /** 境界の口の ID（openings[].id） */
  opening: z.string().optional(),
  /** 出入口・ワープ：それぞれのエリアの中のタイル座標 */
  at: z.strictObject({ from: IntPair, to: IntPair }).optional(),
});
export type AtlasEdge = z.infer<typeof AtlasEdge>;

/** 地図で辺が接している 2 つのエリアの間の、通れるマスが続く区間 */
export const Opening = z.strictObject({
  id: z.string(),
  a: z.string(),
  b: z.string(),
  /** 越える向きの軸（x = 左右の辺、y = 上下の辺） */
  axis: z.enum(['x', 'y']),
  /** 区間の始まり（世界座標のタイル）。axis が x なら [境界の x, 始まりの y] */
  world: IntPair,
  cells: z.number().int().positive(),
  /** 向きごとの通過試験の結果（キーは "a>b" / "b>a"） */
  pass: z.strictObject({ 'a>b': Pass, 'b>a': Pass }),
});
export type Opening = z.infer<typeof Opening>;

export const Finding = z.strictObject({
  /** 検査の名前 + 対象。同じ問題なら毎回同じ */
  key: z.string(),
  check: z.string(),
  severity: Severity,
  nodes: z.array(z.string()).default([]),
  edges: z.array(z.string()).default([]),
  text: z.string(),
  fix: z.array(z.string()).optional(),
});
export type Finding = z.infer<typeof Finding>;

export const Atlas = z.strictObject({
  version: z.literal(1),
  generatedAt: z.string(),
  git: z.strictObject({ commit: z.string().nullable(), dirty: z.boolean() }),
  start: z.string(),
  nodes: z.array(AtlasNode),
  edges: z.array(AtlasEdge),
  openings: z.array(Opening),
  findings: z.array(Finding),
  stats: z.strictObject({
    areas: z.number().int(),
    edges: z.record(z.string(), z.number().int()),
    /** 起点か、行き来できるエリアの割合 */
    roundTrip: z.number(),
    oneWay: z.number().int(),
    /** なくなると世界が分かれるエリア */
    articulation: z.array(z.string()),
    /** なくなると世界が分かれる辺（境界の口は口の ID、ワープ・出入口は辺の ID） */
    bridges: z.array(z.string()),
    findings: z.strictObject({ red: z.number().int(), yellow: z.number().int(), info: z.number().int() }),
  }),
});
export type Atlas = z.infer<typeof Atlas>;
