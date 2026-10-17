import type { ContentIssue } from '../engine/content';

/**
 * 画面に重ねる最小限の UI（段階1）。
 * 段階8で Preact による拡張可能な UI 部品（置き場所・表示条件・入力の優先度を申告する）に置き換える。
 */

const root = () => document.getElementById('ui')!;

function el(cls: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = cls;
  root().appendChild(div);
  return div;
}

let titleEl: HTMLDivElement | null = null;
let titleTimer = 0;

export function showAreaTitle(name: string, sub: string): void {
  titleEl ??= el('area-title');
  titleEl.replaceChildren(document.createTextNode(name), Object.assign(document.createElement('small'), { textContent: sub }));
  titleEl.classList.add('visible');
  window.clearTimeout(titleTimer);
  titleTimer = window.setTimeout(() => titleEl?.classList.remove('visible'), 2200);
}

let promptEl: HTMLDivElement | null = null;
let promptText: string | null = null;

/** 状況に応じた操作のヒント。key は表示するキー名 */
export function setPrompt(key: string | null, label = ''): void {
  const text = key ? `${key}:${label}` : null;
  if (text === promptText) return;
  promptText = text;
  promptEl ??= el('prompt');
  promptEl.replaceChildren();
  if (key) promptEl.append(Object.assign(document.createElement('kbd'), { textContent: key }), label);
}

let debugEl: HTMLDivElement | null = null;

export function setDebug(text: string | null): void {
  if (text === null) {
    debugEl?.remove();
    debugEl = null;
    return;
  }
  debugEl ??= el('debug');
  debugEl.textContent = text;
}

let issuesEl: HTMLDivElement | null = null;

/** content/ の検証で見つかった問題を表示する */
export function showIssues(issues: ContentIssue[], fatal = false): void {
  issuesEl?.remove();
  issuesEl = null;
  if (issues.length === 0) return;
  issuesEl = el(fatal ? 'issues fatal' : 'issues');
  const errors = issues.filter((i) => i.level === 'error').length;
  const h = document.createElement('h2');
  h.textContent = `content の問題: エラー ${errors} / 警告 ${issues.length - errors}`;
  issuesEl.appendChild(h);
  for (const issue of issues) {
    const line = document.createElement('div');
    line.className = issue.level;
    const code = document.createElement('code');
    code.textContent = issue.file;
    line.append(code, ` ${issue.message}`);
    issuesEl.appendChild(line);
  }
}
