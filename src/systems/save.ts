import { emptySlots, resize, type Slots } from './inventory';

/**
 * セーブデータ。エリアをまたぐ状態はすべてここに持つ（エリアの中身には持たせない）。
 * 形を変えるときは SAVE_VERSION を上げ、migrate に移行処理を足す。
 */

export const SAVE_VERSION = 3;
const KEY = 'little-world:save';

/** 夢の回廊（段階2以上の拠点が共有する倉庫）の入れ物の名前 */
export const CORRIDOR = '__corridor';

/** 建築モードで置いた物（上書き層。content/ の原本は書き換えない） */
export interface PlacedRecord {
  object: string;
  /** 足元のタイル */
  at: [number, number];
  flipX: boolean;
  /** 置ける箱の中身（調べる種類 chest。最初に開いたときに作る） */
  contents?: Slots;
}

/** 眠った場所。spawn は area.json の spawns の名前、tile は置いたベッドの前のマス */
export type Respawn = { area: string; spawn: string } | { area: string; tile: [number, number] };

export interface SaveData {
  version: number;
  /** 訪れたエリア（地図に出す） */
  visited: string[];
  /** 一度通ったワープの id（地図に線を出す） */
  usedWarps: string[];
  /** 持っている拠点 → 段階 */
  bases: Record<string, number>;
  pocket: Slots;
  /** 拠点のエリア id（または CORRIDOR）→ 倉庫 */
  storage: Record<string, Slots>;
  /** 眠った場所（次に始めるところ） */
  respawn: Respawn | null;
  /** エリアに入った回数（揺らぎ区域の作り直しの種） */
  visits: Record<string, number>;
  /** エリア → 建築モードで置いた物（版 2） */
  placed: Record<string, PlacedRecord[]>;
  /** エリア → しまった原本の物（"物の ID@x,y"。版 2） */
  hidden: Record<string, string[]>;
  /** 1 回だけ配った物の名前（"starter" = 最初の持ち物。版 3） */
  granted: string[];
}

export function newSave(pocketSlots: number): SaveData {
  return {
    version: SAVE_VERSION,
    visited: [],
    usedWarps: [],
    bases: {},
    pocket: emptySlots(pocketSlots),
    storage: {},
    respawn: null,
    visits: {},
    placed: {},
    hidden: {},
    granted: [],
  };
}

/** 古い版のセーブを今の形に直す */
export function migrate(raw: unknown, pocketSlots: number): SaveData {
  const fresh = newSave(pocketSlots);
  if (!raw || typeof raw !== 'object') return fresh;
  const data = { ...fresh, ...(raw as Partial<SaveData>) };
  // 版を上げたら、ここに if ((data.version ?? 1) < n) { … } を足していく
  if ((data.version ?? 1) < 2) {
    // 版 2：建築モードの上書き層
    data.placed = {};
    data.hidden = {};
  }
  if ((data.version ?? 1) < 3) {
    // 版 3：置ける箱の中身（placed[].contents）と、1 回だけ配る物の記録。今あるセーブにも最初の持ち物を配る
    data.granted = [];
  }
  data.placed ??= {};
  data.hidden ??= {};
  data.granted ??= [];
  data.version = SAVE_VERSION;
  data.pocket = resize(data.pocket ?? [], pocketSlots);
  return data;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class SaveStore {
  data: SaveData;

  constructor(
    private readonly storage: SaveStorage | null,
    pocketSlots: number,
  ) {
    let raw: unknown = null;
    try {
      const text = storage?.getItem(KEY);
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = null;
    }
    this.data = migrate(raw, pocketSlots);
  }

  save(): void {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // 保存できない環境（プライベートウィンドウなど）でも遊べるようにする
    }
  }

  /** 書き出し（ファイルに保存する用） */
  export(): string {
    return JSON.stringify(this.data, null, 2);
  }

  reset(pocketSlots: number): void {
    this.data = newSave(pocketSlots);
    try {
      this.storage?.removeItem(KEY);
    } catch {
      // 同上
    }
  }

  markVisited(area: string): void {
    if (!this.data.visited.includes(area)) this.data.visited.push(area);
    this.data.visits[area] = (this.data.visits[area] ?? 0) + 1;
  }

  markWarp(id: string): void {
    if (!this.data.usedWarps.includes(id)) this.data.usedWarps.push(id);
  }
}
