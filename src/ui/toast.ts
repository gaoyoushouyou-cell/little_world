/** 画面の左下に少しだけ出る知らせ（「丸太 ×1」など） */
export function showToast(text: string): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  let box = ui.querySelector<HTMLDivElement>('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    ui.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  box.appendChild(t);
  while (box.children.length > 4) box.firstElementChild?.remove();
  window.setTimeout(() => t.classList.add('fade'), 1800);
  window.setTimeout(() => t.remove(), 2400);
}
