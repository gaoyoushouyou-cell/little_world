/**
 * 一度に1つだけ開く画面（一覧・倉庫・地図）。開いている間はゲームが止まる。
 * 別の画面を開くと前の画面は閉じる（onClose は呼ばれる）。
 */

interface Modal {
  el: HTMLElement;
  onKey(e: KeyboardEvent): boolean;
  onClose?(): void;
}

let current: Modal | null = null;
let installed = false;

const CANCEL = new Set(['Escape', 'Backspace', 'x', 'X']);

function install(): void {
  if (installed) return;
  installed = true;
  window.addEventListener(
    'keydown',
    (e) => {
      if (!current) return;
      if (current.onKey(e)) {
        e.preventDefault();
        return;
      }
      if (CANCEL.has(e.key)) {
        e.preventDefault();
        closeModal();
      }
    },
    true,
  );
}

export function isModalOpen(): boolean {
  return current !== null;
}

export function openModal(cls: string, onKey: (e: KeyboardEvent) => boolean, onClose?: () => void): HTMLElement {
  install();
  closeModal();
  const el = document.createElement('div');
  el.className = `modal ${cls}`;
  document.getElementById('ui')!.appendChild(el);
  current = { el, onKey, onClose };
  return el;
}

export function closeModal(): void {
  if (!current) return;
  const m = current;
  current = null;
  m.el.remove();
  m.onClose?.();
}

export const CONFIRM = new Set(['Enter', ' ', 'e', 'E', 'z', 'Z']);
