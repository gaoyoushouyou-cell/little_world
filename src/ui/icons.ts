import type { Content } from '../engine/content';
import { gridToCanvas } from '../engine/pixelart';

const cache = new Map<string, string>();

/** スプライトの1コマ目を画像の URL にする（UI のアイコン用） */
export function spriteUrl(content: Content, spriteId: string): string {
  let url = cache.get(spriteId);
  if (!url) {
    const sprite = content.sprites.get(spriteId);
    const rows = sprite ? Object.values(sprite.animations)[0]?.[0] : undefined;
    url = rows && sprite ? gridToCanvas(sprite.palette, rows).toDataURL() : '';
    cache.set(spriteId, url);
  }
  return url;
}

export function itemIconUrl(content: Content, itemId: string): string {
  const item = content.items.get(itemId);
  return item ? spriteUrl(content, item.icon) : '';
}
