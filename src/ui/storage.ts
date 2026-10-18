import type { Content } from '../engine/content';
import { moveAll, moveSlot, quickStack, sortSlots, splitHalf, totalWeight } from '../systems/inventory';
import { itemIconUrl } from './icons';
import { CONFIRM, openModal } from './modal';
import type { Panel, StorageOptions } from './ui';

const COLS = 6;

/**
 * 持ち物の格子。左右2つなら、Enter で選んだマスをもう一方へ移し、A で手持ちを全部しまう。
 * 矢印で選ぶ（左右の端を越えるともう一方の格子へ）。マウスでクリックしても移せる。
 * T 並べ替え（同じ物はまとめる）、H 半分に分ける、Q 同じ物だけ倉庫へまとめて入れる（決定 58）。
 */
export function openStoragePanel(content: Content, left: Panel, right: Panel | null, onChange: () => void, onClose?: () => void, options: StorageOptions = {}): void {
  const panels = right ? [left, right] : [left];
  let side = 0;
  let index = 0;
  const maxStack = (item: string) => content.items.get(item)?.maxStack ?? 99;
  const weightOf = (item: string) => content.items.get(item)?.weight ?? 0;
  /** 並べ替えの順：素材が先、家具が後。同じ種類の中は content の読み込み順 */
  const itemOrder = new Map([...content.items.values()].map((it, i) => [it.id, (it.kind === 'furniture' ? 10_000 : 0) + i]));
  const order = (item: string) => itemOrder.get(item) ?? 99_999;
  const quickTo: Panel[] = right ? [right] : (options.quickTargets ?? []);
  let message = '';

  const el = openModal(
    right ? 'storage' : 'storage single',
    (e) => {
      const slots = panels[side]!.slots;
      const col = index % COLS;
      if (e.key === 'ArrowRight') {
        if (col === COLS - 1 || index === slots.length - 1) {
          if (panels.length > 1) {
            side = 1 - side;
            index = Math.min(panels[side]!.slots.length - 1, index - col);
          }
        } else index++;
      } else if (e.key === 'ArrowLeft') {
        if (col === 0) {
          if (panels.length > 1) {
            side = 1 - side;
            const other = panels[side]!.slots.length;
            index = Math.min(other - 1, index + COLS - 1);
          }
        } else index--;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (index + COLS < slots.length) index += COLS;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (index - COLS >= 0) index -= COLS;
      } else if (right && (e.key === 'a' || e.key === 'A')) {
        storeAll();
      } else if (e.key === 't' || e.key === 'T') {
        sortSlots(panels[side]!.slots, order, maxStack);
        onChange();
      } else if (e.key === 'h' || e.key === 'H') {
        if (splitHalf(panels[side]!.slots, index)) onChange();
      } else if (options.onCraft && (e.key === 'c' || e.key === 'C')) {
        options.onCraft();
        return true;
      } else if (quickTo.length && (e.key === 'q' || e.key === 'Q')) {
        quick();
      } else if (right && CONFIRM.has(e.key)) {
        move(side, index);
      } else return false;
      render();
      return true;
    },
    onClose,
  );

  function move(fromSide: number, i: number): void {
    if (!right) return;
    const from = panels[fromSide]!.slots;
    const to = panels[1 - fromSide]!.slots;
    if (moveSlot(from, i, to, maxStack) > 0) onChange();
  }

  function quick(): void {
    let n = 0;
    for (const target of quickTo) n += quickStack(left.slots, target.slots, maxStack);
    if (n > 0) onChange();
    const names = [...new Set(quickTo.map((t) => t.title))].join('・');
    message = n > 0 ? `${names}へ ${n} 個まとめて入れた` : `${names}にある物は持っていない`;
  }

  function storeAll(): void {
    if (right && moveAll(left.slots, right.slots, maxStack) > 0) onChange();
  }

  function grid(p: Panel, s: number): HTMLElement {
    const box = document.createElement('section');
    const h = document.createElement('h3');
    const used = p.slots.filter(Boolean).length;
    h.textContent = `${p.title}  ${used}/${p.slots.length}` + (p.showWeight ? `　重さ ${totalWeight(p.slots, weightOf)}` : '');
    box.appendChild(h);
    const g = document.createElement('div');
    g.className = 'grid';
    p.slots.forEach((st, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (s === side && i === index) cell.classList.add('selected');
      if (st) {
        const img = document.createElement('img');
        img.src = itemIconUrl(content, st.item);
        img.alt = content.items.get(st.item)?.name ?? st.item;
        cell.appendChild(img);
        const n = document.createElement('span');
        n.className = 'count';
        n.textContent = String(st.count);
        cell.appendChild(n);
        if (st.quality > 1) {
          const q = document.createElement('span');
          q.className = 'quality';
          q.textContent = `質${st.quality}`;
          cell.appendChild(q);
        }
      }
      cell.addEventListener('click', () => {
        side = s;
        index = i;
        move(s, i);
        render();
      });
      g.appendChild(cell);
    });
    box.appendChild(g);
    return box;
  }

  function render(): void {
    el.replaceChildren();
    const row = document.createElement('div');
    row.className = 'panels';
    panels.forEach((p, s) => row.appendChild(grid(p, s)));
    el.appendChild(row);
    const st = panels[side]!.slots[index];
    const info = document.createElement('p');
    info.className = 'info';
    const item = st ? content.items.get(st.item) : undefined;
    const kind = item?.kind === 'furniture' ? '家具（拠点で B を押して置く）' : '素材';
    info.textContent = st && item ? `${item.name}　${kind}　質 ${st.quality}　×${st.count}　重さ ${item.weight * st.count}` : '　';
    el.appendChild(info);
    if (message) {
      el.appendChild(Object.assign(document.createElement('p'), { className: 'info', textContent: message }));
      message = '';
    }
    if (right) {
      const btn = document.createElement('button');
      btn.textContent = '手持ちを全部しまう [A]';
      btn.addEventListener('click', () => {
        storeAll();
        render();
      });
      el.appendChild(btn);
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = [
      '矢印 選ぶ',
      right ? 'Enter 移す　A 全部しまう' : '',
      quickTo.length ? `Q ${right ? right.title : quickTo.length > 1 ? '倉庫と箱' : quickTo[0]!.title}へまとめる` : '',
      'T 並べ替え　H 半分に分ける',
      options.onCraft ? 'C 手作り' : '',
      'Esc 閉じる',
    ]
      .filter(Boolean)
      .join('　');
    el.appendChild(hint);
  }

  render();
}
