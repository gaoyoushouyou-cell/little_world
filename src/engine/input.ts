import Phaser from 'phaser';

/**
 * キーボード入力。移動: 矢印 / WASD、ジャンプ: Space / Z、調べる・入る: E / X / Enter、
 * デバッグ表示: `（バッククォート）。ゲームパッドとキーの割り当て変更は段階8。
 */
export interface FrameInput {
  x: number;
  y: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  debugPressed: boolean;
}

const BINDINGS = {
  left: ['LEFT', 'A'],
  right: ['RIGHT', 'D'],
  up: ['UP', 'W'],
  down: ['DOWN', 'S'],
  jump: ['SPACE', 'Z'],
  interact: ['E', 'X', 'ENTER'],
  debug: ['BACKTICK'],
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
    const pressed = (a: Action) => now[a] && !this.prev[a];
    const result: FrameInput = {
      x: (now.right ? 1 : 0) - (now.left ? 1 : 0),
      y: (now.down ? 1 : 0) - (now.up ? 1 : 0),
      jumpHeld: now.jump,
      jumpPressed: pressed('jump'),
      interactPressed: pressed('interact'),
      debugPressed: pressed('debug'),
    };
    Object.assign(this.prev, now);
    return result;
  }
}
