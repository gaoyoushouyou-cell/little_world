import type Phaser from 'phaser';
import type { z } from 'zod';
import type { LoadedArea } from '../../engine/content';
import type { TileDef } from '../../schema/assets';

export interface LayerContext {
  scene: Phaser.Scene;
  area: LoadedArea;
  /** タイル ID → 定義（全タイルセット） */
  tiles: ReadonlyMap<string, TileDef>;
  /** 表示の重なり順 */
  depth: number;
  /** 作ったテクスチャのキーを登録すると、エリアを出るときに破棄される */
  track(textureKey: string): void;
}

export interface LayerInstance {
  /** time はエリアの timeScale を掛けた経過時間（ms） */
  update?(cam: Phaser.Cameras.Scene2D.Camera, time: number): void;
}

export interface LayerPlugin<P = any> {
  type: string;
  /** type を除いたパラメータのスキーマ */
  params: z.ZodType<P, any>;
  create(ctx: LayerContext, params: P): LayerInstance;
}

export function defineLayer<S extends z.ZodType>(plugin: {
  type: string;
  params: S;
  create(ctx: LayerContext, params: z.infer<S>): LayerInstance;
}): LayerPlugin<z.infer<S>> {
  return plugin as LayerPlugin<z.infer<S>>;
}
