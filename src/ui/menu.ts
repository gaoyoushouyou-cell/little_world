import { CONFIRM, openModal } from './modal';
import type { MenuItem } from './ui';

/** 縦に並んだ一覧。↑↓ で選び、Enter / E / Space で決める。マウスでも選べる */
export function openMenu(title: string, items: MenuItem[], subtitle?: string, startIndex?: number): void {
  let index = startIndex !== undefined && items[startIndex] ? startIndex : Math.max(0, items.findIndex((i) => !i.disabled));
  const el = openModal('menu', (e) => {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      index = (index + 1) % items.length;
      render();
      return true;
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      index = (index + items.length - 1) % items.length;
      render();
      return true;
    }
    if (CONFIRM.has(e.key)) {
      choose(index);
      return true;
    }
    return false;
  });

  function choose(i: number): void {
    const item = items[i];
    if (!item || item.disabled) return;
    item.run();
  }

  function render(): void {
    el.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = title;
    el.appendChild(h);
    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'sub';
      sub.textContent = subtitle;
      el.appendChild(sub);
    }
    const list = document.createElement('ul');
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.textContent = item.label;
      if (i === index) li.classList.add('selected');
      if (item.disabled) li.classList.add('disabled');
      li.addEventListener('mouseenter', () => {
        index = i;
        render();
      });
      li.addEventListener('click', () => choose(i));
      list.appendChild(li);
    });
    el.appendChild(list);
    const detail = items[index]?.detail;
    if (detail?.length) {
      const d = document.createElement('div');
      d.className = 'detail';
      for (const line of detail) {
        const p = document.createElement('p');
        p.textContent = line;
        if (line.startsWith('×')) p.className = 'lack';
        d.appendChild(p);
      }
      el.appendChild(d);
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = '↑↓ 選ぶ　Enter 決める　Esc 閉じる';
    el.appendChild(hint);
  }

  render();
}
