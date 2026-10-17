import { describe, expect, it } from 'vitest';
import { dirFromVelocity, resolveAnimation } from '../src/engine/facing';

const traveler = new Set(['idle_down', 'idle_up', 'idle_right', 'walk_down', 'walk_up', 'walk_right']);
const dreamer = new Set(['idle', 'walk']);
const has = (set: Set<string>) => (name: string) => set.has(name);

describe('resolveAnimation', () => {
  it('見下ろしは向きごとのアニメーション。左は右の反転', () => {
    expect(resolveAnimation(has(traveler), 'walk', 'top', 'down')).toEqual({ anim: 'walk_down', flipX: false });
    expect(resolveAnimation(has(traveler), 'walk', 'top', 'up')).toEqual({ anim: 'walk_up', flipX: false });
    expect(resolveAnimation(has(traveler), 'idle', 'top', 'left')).toEqual({ anim: 'idle_right', flipX: true });
  });

  it('横視点は _side がなければ _right で代用する', () => {
    expect(resolveAnimation(has(traveler), 'walk', 'side', 'right')).toEqual({ anim: 'walk_right', flipX: false });
    expect(resolveAnimation(has(traveler), 'walk', 'side', 'left')).toEqual({ anim: 'walk_right', flipX: true });
    expect(resolveAnimation(has(new Set([...traveler, 'walk_side'])), 'walk', 'side', 'right').anim).toBe('walk_side');
  });

  it('向きのないスプライトは idle / walk のまま', () => {
    expect(resolveAnimation(has(dreamer), 'walk', 'top', 'up')).toEqual({ anim: 'walk', flipX: false });
    expect(resolveAnimation(has(dreamer), 'idle', 'side', 'left')).toEqual({ anim: 'idle', flipX: true });
  });

  it('歩きがなければ同じ向きの待機を使う', () => {
    expect(resolveAnimation(has(new Set(['idle_down', 'idle_right'])), 'walk', 'top', 'right').anim).toBe('idle_right');
  });
});

describe('dirFromVelocity', () => {
  it('大きい方の軸で向きが決まり、止まっていれば前の向きのまま', () => {
    expect(dirFromVelocity(1, 0.5, 'down')).toBe('right');
    expect(dirFromVelocity(-0.2, -1, 'down')).toBe('up');
    expect(dirFromVelocity(0, 0, 'left')).toBe('left');
  });
});
