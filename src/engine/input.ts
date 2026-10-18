import Phaser from 'phaser';

/**
 * キーボード入力。移動: 矢印 / WASD、ジャンプ: Space / Z、調べる・入る: E / X / Enter、持ち物: I、地図: M、
 * 建築モード: B（中では Q / E 選ぶ、Enter / Space 置く、X / Delete しまう、R 反転、Esc / B 戻る）、手作り: C、
 * デバッグ表示: `（バッククォート）。ゲームパッドとキーの割り当て変更は段階8。
 */
export interface FrameInput {
  x: number;
  y: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  debugPressed: boolean;
  /** 持ち物を開く（I） */
  inventoryPressed: boolean;
  /** 地図を開く（M） */
  mapPressed: boolean;
  /** 建築モード（B）と、その中で使うキー */
  buildPressed: boolean;
  prevPressed: boolean;
  nextPressed: boolean;
  placePressed: boolean;
  pickupPressed: boolean;
  flipPressed: boolean;
  cancelPressed: boolean;
  /** 手作りの一覧（C） */
  craftPressed: boolean;
}

const BINDINGS = {
  left: ['LEFT', 'A'],
  right: ['RIGHT', 'D'],
  up: ['UP', 'W'],
  down: ['DOWN', 'S'],
  jump: ['SPACE', 'Z'],
  interact: ['E', 'X', 'ENTER'],
  debug: ['BACKTICK'],
  inventory: ['I'],
  map: ['M'],
  build: ['B'],
  prev: ['Q'],
  next: ['E'],
  place: ['ENTER', 'SPACE'],
  pickup: ['X', 'DELETE'],
  flip: ['R'],
  cancel: ['ESC'],
  craft: ['C'],
} as const;

type Action = keyof typeof BINDINGS;

export class Controls {
  private readonly keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private readonly prev: Record<Action, boolean>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const codes = Phaser.Input.Keyboard.KeyCodes as Record<string, number>;
    this.keys = Object.fromEntries(
      Object.entries(BINDINGS).map(([action, names]) => [action, names.map((n) => kb.addKey(codes[n]!))]),
    ) as Record<Action, Phaser.Input.Keyboard.Key[]>;
    this.prev = Object.fromEntries(Object.keys(BINDINGS).map((a) => [a, true])) as Record<Action, boolean>;
  }

  private down(action: Action): boolean {
    return this.keys[action].some((k) => k.isDown);
  }

  /** 毎フレーム1回呼ぶ。pressed は「このフレームで押された」 */
  read(): FrameInput {
    const now = Object.fromEntries(Object.keys(BINDINGS).map((a) => [a, this.down(a as Action)])) as Record<Action, boolean>;
    // フレームの間に押して離した短い押し方も拾う（JustDown は1回読むと消えるので、キーごとに1回だけ読む）
    const tapped = new Map<Phaser.Input.Keyboard.Key, boolean>();
    for (const keys of Object.values(this.keys)) for (const k of keys) if (!tapped.has(k)) tapped.set(k, Phaser.Input.Keyboard.JustDown(k));
    const pressed = (a: Action) => (now[a] && !this.prev[a]) || this.keys[a].some((k) => tapped.get(k));
    const result: FrameInput = {
      x: (now.right || pressed('right') ? 1 : 0) - (now.left || pressed('left') ? 1 : 0),
      y: (now.down || pressed('down') ? 1 : 0) - (now.up || pressed('up') ? 1 : 0),
      jumpHeld: now.jump,
      jumpPressed: pressed('jump'),
      interactPressed: pressed('interact'),
      debugPressed: pressed('debug'),
      inventoryPressed: pressed('inventory'),
      mapPressed: pressed('map'),
      buildPressed: pressed('build'),
      prevPressed: pressed('prev'),
      nextPressed: pressed('next'),
      placePressed: pressed('place'),
      pickupPressed: pressed('pickup'),
      flipPressed: pressed('flip'),
      cancelPressed: pressed('cancel'),
      craftPressed: pressed('craft'),
    };
    Object.assign(this.prev, now);
    return result;
  }
}
