/**
 * 持ち物と倉庫。すべての入れ物を「マスの配列」として同じように扱う（null は空きマス）。
 * 同じ素材でも質が違えば別のマスに重ねる。
 */

export interface Stack {
  item: string;
  quality: number;
  count: number;
}

export type Slots = (Stack | null)[];

export function emptySlots(n: number): Slots {
  return Array.from({ length: n }, () => null);
}

/** マス数を変える（増やすときは空きを足し、減らすときは後ろの空きマスだけ削る） */
export function resize(slots: Slots, n: number): Slots {
  const out = slots.slice();
  while (out.length < n) out.push(null);
  while (out.length > n && out[out.length - 1] === null) out.pop();
  return out;
}

/** 入れる。入りきらなかった数を返す */
export function addItem(slots: Slots, item: string, quality: number, count: number, maxStack: number): number {
  let left = count;
  for (const s of slots) {
    if (left === 0) break;
    if (s && s.item === item && s.quality === quality && s.count < maxStack) {
      const n = Math.min(left, maxStack - s.count);
      s.count += n;
      left -= n;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (slots[i] === null) {
      const n = Math.min(left, maxStack);
      slots[i] = { item, quality, count: n };
      left -= n;
    }
  }
  return left;
}

export function canAdd(slots: Slots, item: string, quality: number, count: number, maxStack: number): boolean {
  return addItem(structuredClone(slots), item, quality, count, maxStack) === 0;
}

/** 質が minQuality 以上の数 */
export function countItem(slots: Slots, item: string, minQuality = 1): number {
  return slots.reduce((n, s) => n + (s && s.item === item && s.quality >= minQuality ? s.count : 0), 0);
}

/** 取り出す（質の低いものから使う）。足りなければ何もせず false */
export function removeItem(slots: Slots, item: string, count: number, minQuality = 1): boolean {
  if (countItem(slots, item, minQuality) < count) return false;
  let left = count;
  const order = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s && s.item === item && s.quality >= minQuality)
    .sort((a, b) => a.s!.quality - b.s!.quality);
  for (const { s, i } of order) {
    const n = Math.min(left, s!.count);
    s!.count -= n;
    left -= n;
    if (s!.count === 0) slots[i] = null;
    if (left === 0) break;
  }
  return true;
}

/** 1マス分を別の入れ物へ移す。移した数を返す */
export function moveSlot(from: Slots, index: number, to: Slots, maxStack: (item: string) => number): number {
  const s = from[index];
  if (!s) return 0;
  const left = addItem(to, s.item, s.quality, s.count, maxStack(s.item));
  const moved = s.count - left;
  if (left === 0) from[index] = null;
  else s.count = left;
  return moved;
}

/** すべて移す。移した数を返す */
export function moveAll(from: Slots, to: Slots, maxStack: (item: string) => number): number {
  let moved = 0;
  for (let i = 0; i < from.length; i++) moved += moveSlot(from, i, to, maxStack);
  return moved;
}

export interface CostLine {
  item: string;
  count: number;
  minQuality: number;
}

/** 複数の入れ物を合わせて費用が足りるか */
export function canPay(sources: Slots[], cost: CostLine[]): boolean {
  return cost.every((c) => sources.reduce((n, s) => n + countItem(s, c.item, c.minQuality), 0) >= c.count);
}

/** 費用を払う（前の入れ物から順に使う）。足りなければ何もせず false */
export function pay(sources: Slots[], cost: CostLine[]): boolean {
  if (!canPay(sources, cost)) return false;
  for (const c of cost) {
    let left = c.count;
    for (const s of sources) {
      const n = Math.min(left, countItem(s, c.item, c.minQuality));
      if (n > 0) removeItem(s, c.item, n, c.minQuality);
      left -= n;
      if (left === 0) break;
    }
  }
  return true;
}

// ---- 持ち物の強化（決定 58） ------------------------------------------------

/**
 * 並べ替える（同じ物・同じ質はまとめる）。order が小さい物ほど前、同じ物は質の高いほうが前。空きマスは後ろ
 */
export function sortSlots(slots: Slots, order: (item: string) => number, maxStack: (item: string) => number): void {
  const stacks = slots.filter((s): s is Stack => s !== null).map((s) => ({ ...s }));
  stacks.sort((a, b) => order(a.item) - order(b.item) || a.item.localeCompare(b.item) || b.quality - a.quality);
  const merged: Stack[] = [];
  for (const s of stacks) {
    let left = s.count;
    for (const m of merged) {
      if (left === 0) break;
      if (m.item === s.item && m.quality === s.quality && m.count < maxStack(s.item)) {
        const n = Math.min(left, maxStack(s.item) - m.count);
        m.count += n;
        left -= n;
      }
    }
    while (left > 0) {
      const n = Math.min(left, maxStack(s.item));
      merged.push({ item: s.item, quality: s.quality, count: n });
      left -= n;
    }
  }
  for (let i = 0; i < slots.length; i++) slots[i] = merged[i] ?? null;
}

/** 選んだマスの半分（切り捨て）を空きマスへ分ける。分けられたら true */
export function splitHalf(slots: Slots, index: number): boolean {
  const s = slots[index];
  const empty = slots.indexOf(null);
  if (!s || s.count < 2 || empty < 0) return false;
  const half = Math.floor(s.count / 2);
  s.count -= half;
  slots[empty] = { item: s.item, quality: s.quality, count: half };
  return true;
}

/** 移し先にすでにある物（同じ物・同じ質）だけを移す（Terraria の「まとめて入れる」）。移した数を返す */
export function quickStack(from: Slots, to: Slots, maxStack: (item: string) => number): number {
  const has = new Set(to.filter((s): s is Stack => s !== null).map((s) => `${s.item}#${s.quality}`));
  let moved = 0;
  for (let i = 0; i < from.length; i++) {
    const s = from[i];
    if (s && has.has(`${s.item}#${s.quality}`)) moved += moveSlot(from, i, to, maxStack);
  }
  return moved;
}

/** 重さの合計 */
export function totalWeight(slots: Slots, weightOf: (item: string) => number): number {
  return slots.reduce((n, s) => n + (s ? weightOf(s.item) * s.count : 0), 0);
}
