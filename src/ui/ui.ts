import type { Content } from '../engine/content';
import type { Slots } from '../systems/inventory';
import { closeModal, isModalOpen } from './modal';
import { openMenu } from './menu';
import { openStoragePanel } from './storage';
import { showToast } from './toast';

/**
 * ゲームから使う UI の入口（段階8で Preact の拡張可能な UI 部品に置き換える）。
 * 開いている間はゲームが止まる。閉じる：Esc / Backspace / X
 */

export interface MenuItem {
  label: string;
  /** 選んでいるときに下に出す説明（費用など） */
  detail?: string[];
  disabled?: boolean;
  run(): void;
}

export interface Panel {
  title: string;
  slots: Slots;
  /** 見出しに重さの合計を出す（手持ち） */
  showWeight?: boolean;
}

export interface StorageOptions {
  /** 1つだけ開いているときに、Q で同じ物をまとめて入れる先（拠点の倉庫と、このエリアの箱。決定 61） */
  quickTargets?: Panel[];
  /** C で手作りの一覧を開く（決定 64） */
  onCraft?: () => void;
}

export interface Ui {
  /** startIndex：最初に選んでおく行（作ったあとに同じ行のまま開き直すときなど） */
  menu(title: string, items: MenuItem[], subtitle?: string, startIndex?: number): void;
  /** 左右の入れ物の間で持ち物を移す。right が null なら見るだけ */
  storage(left: Panel, right: Panel | null, onChange: () => void, onClose?: () => void, options?: StorageOptions): void;
  toast(text: string): void;
  close(): void;
  isOpen(): boolean;
}

export function createUi(content: Content): Ui {
  return {
    menu: (title, items, subtitle, startIndex) => openMenu(title, items, subtitle, startIndex),
    storage: (left, right, onChange, onClose, options) => openStoragePanel(content, left, right, onChange, onClose, options),
    toast: (text) => showToast(text),
    close: () => closeModal(),
    isOpen: () => isModalOpen(),
  };
}
