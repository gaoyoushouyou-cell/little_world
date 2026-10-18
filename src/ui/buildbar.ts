import type { Content } from '../engine/content';
import { itemIconUrl } from './icons';

/**
 * 建築モードの帯（決定 52）。画面の下に、置ける家具と操作のヒントを出す。
 * 操作そのものは scenes/buildmode.ts が受け取る（この帯はキーを読まない）。
 */

export interface BuildEntry {
  item: string;
  count: number;
}

let barEl: HTMLDivElement | null = null;

export function showBuildBar(content: Content, entries: readonly BuildEntry[], selected: number, status: string, ok: boolean, atTop = false): void {
  if (!barEl) {
    barEl = document.createElement('div');
    barEl.className = 'buildbar';
    barEl.setAttribute('role', 'region');
    barEl.setAttribute('aria-label', '建築モード');
    document.getElementById('ui')!.appendChild(barEl);
  }
  barEl.classList.toggle('top', atTop);
  barEl.replaceChildren();
  const list = document.createElement('div');
  list.className = 'items';
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '置ける家具がない（家具は持ち物か、この拠点の倉庫に入れておく）';
    list.appendChild(empty);
  }
  entries.forEach((e, i) => {
    const cell = document.createElement('div');
    cell.className = i === selected ? 'cell selected' : 'cell';
    const img = document.createElement('img');
    img.src = itemIconUrl(content, e.item);
    img.alt = content.items.get(e.item)?.name ?? e.item;
    cell.appendChild(img);
    if (e.count > 1) cell.appendChild(Object.assign(document.createElement('span'), { className: 'count', textContent: String(e.count) }));
    list.appendChild(cell);
  });
  barEl.appendChild(list);
  const name = entries[selected] ? (content.items.get(entries[selected].item)?.name ?? '') : '';
  const line = document.createElement('p');
  line.className = ok ? 'status ok' : 'status ng';
  line.textContent = [name, status].filter(Boolean).join('　');
  barEl.appendChild(line);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = '矢印 動かす　Q / E 選ぶ　Enter 置く　X しまう　R 反転　Esc 戻る';
  barEl.appendChild(hint);
}

export function hideBuildBar(): void {
  barEl?.remove();
  barEl = null;
}
