import type { Content } from '../../src/engine/content';

/**
 * 解析が読むもの。Content がそのまま当てはまる（テストでは小さな架空の世界を作って渡す）。
 * 使うエリアは loadArea 済みであること（境界の口と通過試験に当たり判定が要る）。
 */
export type AtlasSource = Pick<Content, 'map' | 'areas' | 'world' | 'bases' | 'issues' | 'getLoaded'>;
