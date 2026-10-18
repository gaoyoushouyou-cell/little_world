import type { z } from 'zod';
import type { Content, LoadedArea, PlacedObject } from '../../engine/content';
import type { Slots } from '../../systems/inventory';
import type { SaveStore } from '../../systems/save';
import type { Ui } from '../../ui/ui';

/** 調べたときに使えるゲームの機能（AreaScene が用意する） */
export interface GameServices {
  content: Content;
  save: SaveStore;
  area: LoadedArea;
  ui: Ui;
  /** 眠る：記録して、この拠点で目覚める。置いたベッド（bed）なら、そのベッドのところで目覚める（決定 55） */
  sleep(baseArea: string, bed?: PlacedObject): void;
  /** 拠点どうしの移動 */
  travelToBase(baseArea: string): void;
  /** 加工の材料に使う入れ物（手持ち → 倉庫 → このエリアの箱。拠点の外では手持ちだけ。決定 65） */
  craftSources(): Slots[];
  /** できた物を入れる入れ物（手持ち → 倉庫。決定 68） */
  craftOutputs(): Slots[];
  /** 置いた箱の中身（なければ capacity マスで作る）。置いた物でなければ null */
  containerOf(obj: PlacedObject, capacity: number): Slots | null;
  /** 物の見た目を一時的に変える（null で元に戻す） */
  setObjectSprite(obj: PlacedObject, spriteId: string | null): void;
}

export interface InteractionPlugin<P = any> {
  type: string;
  /** objects/<id>.json の interact（type 以外も含む）のスキーマ */
  params: z.ZodType<P, any>;
  /** 案内に出す言葉。null なら今は調べられない */
  label(s: GameServices, obj: PlacedObject, params: P): string | null;
  run(s: GameServices, obj: PlacedObject, params: P): void;
}

export function defineInteraction<S extends z.ZodType>(plugin: {
  type: string;
  params: S;
  label(s: GameServices, obj: PlacedObject, params: z.infer<S>): string | null;
  run(s: GameServices, obj: PlacedObject, params: z.infer<S>): void;
}): InteractionPlugin<z.infer<S>> {
  return plugin as InteractionPlugin<z.infer<S>>;
}
