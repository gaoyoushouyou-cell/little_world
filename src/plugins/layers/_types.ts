import type Phaser from 'phaser';
import type { z } from 'zod';
import type { LoadedArea } from '../../engine/content';
import type { LoadedImage } from '../../engine/images';
import type { ExpectedFrame } from '../../engine/rendercheck';
import type { TileDef } from '../../schema/assets';

export interface LayerContext {
  scene: Phaser.Scene;
  area: LoadedArea;
  /** タイル ID → 定義（全タイルセット） */
  tiles: ReadonlyMap<string, TileDef>;
  /** 読み込み済みの画像（images で申告したものは、create の前に必ず読み込まれている） */
  images: ReadonlyMap<string, LoadedImage>;
  /** 表示の重なり順 */
  depth: number;
  /** 作ったテクスチャのキーを登録すると、エリアを出るときに破棄される */
  track(textureKey: string): void;
}

export interface LayerInstance {
  /** time はエリアの timeScale を掛けた経過時間（ms） */
  update?(cam: Phaser.Cameras.Scene2D.Camera, time: number): void;
  /** このレイヤーが描くゲームオブジェクト（描画の検証で、ほかを隠すのに使う） */
  objects?: Phaser.GameObjects.GameObject[];
  /**
   * 描画の検証用：今のカメラと時刻で、画面の各ドットがどの色になるはずかを、描画とは別に計算する
   * （engine/rendercheck.ts。開発中に __lw.checkRender() で実際の画面と比べる）
   */
  expect?(cam: Phaser.Cameras.Scene2D.Camera, time: number): ExpectedFrame;
}

export interface LayerPlugin<P = any> {
  type: string;
  /** type を除いたパラメータのスキーマ */
  params: z.ZodType<P, any>;
  /** 使う画像（content/assets/images/ からのパス）。エリアに入るときに Content がまとめて読み込む */
  images?(params: P): string[];
  /** 画像を読み込んだあとの検証。問題があれば日本語の説明を返す */
  check?(params: P, images: ReadonlyMap<string, LoadedImage>): string[];
  create(ctx: LayerContext, params: P): LayerInstance;
}

export function defineLayer<S extends z.ZodType>(plugin: {
  type: string;
  params: S;
  images?(params: z.infer<S>): string[];
  check?(params: z.infer<S>, images: ReadonlyMap<string, LoadedImage>): string[];
  create(ctx: LayerContext, params: z.infer<S>): LayerInstance;
}): LayerPlugin<z.infer<S>> {
  return plugin as LayerPlugin<z.infer<S>>;
}
