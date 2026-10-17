import type { View } from '../schema/area';

/**
 * 向きに合ったアニメーションを選ぶ（art/PIXEL_STYLE.md「6. 向き」の決まり）。
 *   見下ろし：<動き>_down / _up / _right。左は _left、なければ _right の左右反転
 *   横視点：<動き>_side、なければ _right。左は左右反転
 *   どれもなければ向きのない <動き>（例：walk）、さらになければ待機
 */

export type Dir = 'down' | 'up' | 'left' | 'right';

export function resolveAnimation(
  has: (name: string) => boolean,
  state: 'idle' | 'walk',
  view: View,
  dir: Dir,
): { anim: string; flipX: boolean } {
  const left = dir === 'left';
  const tries = (s: string): [string, boolean][] => {
    if (view === 'side') {
      return [
        [`${s}_side`, left],
        [`${s}_right`, left],
        [s, left],
      ];
    }
    if (dir === 'left') {
      return [
        [`${s}_left`, false],
        [`${s}_right`, true],
        [s, true],
      ];
    }
    return [
      [`${s}_${dir}`, false],
      [s, false],
      [`${s}_down`, false],
    ];
  };
  for (const [anim, flipX] of [...tries(state), ...(state === 'walk' ? tries('idle') : [])]) {
    if (has(anim)) return { anim, flipX };
  }
  return { anim: 'idle', flipX: left };
}

/** 速度から見下ろしの向きを決める。ほとんど動いていなければ前の向きのまま */
export function dirFromVelocity(vx: number, vy: number, prev: Dir): Dir {
  if (Math.hypot(vx, vy) < 0.05) return prev;
  if (Math.abs(vx) > Math.abs(vy)) return vx > 0 ? 'right' : 'left';
  return vy > 0 ? 'down' : 'up';
}
