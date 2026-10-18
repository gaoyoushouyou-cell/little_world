/**
 * 描画の検証。レイヤーの種類が「画面のどのドットがどの色になるはずか」を描画とは別に計算し（ExpectedFrame）、
 * 実際に描かれた画面（Screen）と1ドットずつ比べる。
 * 画面の撮影は AreaScene（開発中の __lw.checkRender()）が行い、ここは Phaser に依存しない比べ方だけを持つ。
 */

export type Rgb = [number, number, number];

export interface ExpectedFrame {
  /** 画面のドット (sx, sy) に描かれるはずの色。null = このレイヤーは描かない（背景の色が見える） */
  colorAt(sx: number, sy: number): Rgb | null;
  /** このレイヤーが使う色（背景の色をこれと重ならないように選ぶ） */
  colors?: readonly string[];
  /** 1ドットずつ比べられないとき（半透明で重ねるなど）の理由 */
  skip?: string;
}

/** 画面の解像度（VIEW_W × VIEW_H）にそろえた RGBA */
export interface Screen {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface Mismatch {
  x: number;
  y: number;
  expected: string;
  actual: string;
}

export interface FrameReport {
  /** 比べたドットの数 */
  checked: number;
  /** 絵が描かれるはずのドットの数（残りは背景の色が見えるはずのドット） */
  covered: number;
  mismatches: number;
  /** 最初のいくつかの食い違い */
  samples: Mismatch[];
  skipped?: string;
}

const hex = ([r, g, b]: Rgb) => `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;

/**
 * 拡大して表示している画面を、ゲームの解像度に戻す（各ブロックの中央のドットを取る）。
 * 撮影した画像の大きさが画面の整数倍でなければエラー
 */
export function toScreen(shot: Screen, width: number, height: number): Screen {
  if (shot.width === width && shot.height === height) return shot;
  const kx = shot.width / width;
  const ky = shot.height / height;
  if (!Number.isInteger(kx) || !Number.isInteger(ky)) {
    throw new Error(`撮影した画面 ${shot.width}×${shot.height} が ${width}×${height} の整数倍でない`);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = ((y * ky + (ky >> 1)) * shot.width + x * kx + (kx >> 1)) * 4;
      data.set(shot.data.subarray(s, s + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** レイヤーの色と重ならない背景の色を選ぶ（その色が見えたら「描かれていない」とわかる） */
export function pickBackground(colors: readonly string[] = []): Rgb {
  const used = new Set(colors.map((c) => c.toLowerCase()));
  const candidates: Rgb[] = [[0, 255, 0], [255, 0, 255], [0, 255, 255], [255, 255, 0], [1, 2, 3]];
  return candidates.find((c) => !used.has(hex(c))) ?? [7, 250, 9];
}

/**
 * 画面と期待を1ドットずつ比べる。tolerance は 1 チャンネルあたりの許す差
 * （GPU の色の丸めの分。絵の色どうしの差よりずっと小さくする）
 */
export function compareFrame(screen: Screen, expected: ExpectedFrame, background: Rgb, tolerance = 2, maxSamples = 8): FrameReport {
  if (expected.skip) return { checked: 0, covered: 0, mismatches: 0, samples: [], skipped: expected.skip };
  let mismatches = 0;
  let covered = 0;
  const samples: Mismatch[] = [];
  for (let y = 0; y < screen.height; y++) {
    for (let x = 0; x < screen.width; x++) {
      const want = expected.colorAt(x, y);
      if (want) covered++;
      const target = want ?? background;
      const o = (y * screen.width + x) * 4;
      const got: Rgb = [screen.data[o]!, screen.data[o + 1]!, screen.data[o + 2]!];
      if (Math.abs(got[0] - target[0]) > tolerance || Math.abs(got[1] - target[1]) > tolerance || Math.abs(got[2] - target[2]) > tolerance) {
        mismatches++;
        if (samples.length < maxSamples) samples.push({ x, y, expected: want ? hex(want) : `背景 ${hex(background)}`, actual: hex(got) });
      }
    }
  }
  return { checked: screen.width * screen.height, covered, mismatches, samples };
}
