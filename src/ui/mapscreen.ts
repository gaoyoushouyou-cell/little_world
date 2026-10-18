import type { Content } from '../engine/content';
import { TILE } from '../engine/constants';
import { makeRng } from '../engine/rng';
import { areaMosaic, MOSAIC, type Mosaic } from '../systems/mapview';
import { stageOf } from '../systems/bases';
import type { SaveData } from '../systems/save';
import { closeModal, openModal } from './modal';

/**
 * 地図。訪れたエリアだけを、タイルを 4×4 マスごとにまとめたモザイクで描く（docs/design/08_map.md）。
 * - 枠の色：横視点は青、見下ろしは橙。深いエリアほど暗い
 * - 揺らぎ区域は形が変わるので、ノイズ模様で描く
 * - 一度通ったワープは線（一方通行は矢印）、段階2以上の拠点どうしは点線
 * 操作：矢印で動かす、+ / - で拡大縮小、C で今いる所へ、M / Esc で閉じる
 */

const W = 480;
const H = 270;
const mosaicCache = new Map<string, Mosaic>();

export async function openMap(content: Content, save: SaveData, here: { area: string; x: number; y: number }): Promise<void> {
  const visited = save.visited.filter((id) => content.world.get(id) && content.areas.get(id));
  if (!visited.includes(here.area)) visited.push(here.area);
  await Promise.all(visited.map((id) => content.loadArea(id).catch(() => undefined)));
  for (const id of visited) {
    if (mosaicCache.has(id)) continue;
    const a = content.getLoaded(id);
    if (!a) continue;
    mosaicCache.set(id, areaMosaic(a, (t) => content.tiles.get(t)?.color));
  }

  const placed = visited.map((id) => content.world.get(id)!);
  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  const maxX = Math.max(...placed.map((p) => p.x + p.w));
  const maxY = Math.max(...placed.map((p) => p.y + p.h));
  const herePlaced = content.world.get(here.area)!;
  const hereX = herePlaced.x + here.x / TILE;
  const hereY = herePlaced.y + here.y / TILE;

  // 1マス（4×4 タイル）を何 px で描くか
  let cell = Math.max(2, Math.min(16, Math.floor(Math.min((W - 40) / ((maxX - minX) / MOSAIC), (H - 70) / ((maxY - minY) / MOSAIC)))));
  let camX = (minX + maxX) / 2;
  let camY = (minY + maxY) / 2;
  let blink = true;

  const el = openModal(
    'map',
    (e) => {
      const step = (MOSAIC * 24) / cell;
      if (e.key === 'ArrowLeft') camX -= step;
      else if (e.key === 'ArrowRight') camX += step;
      else if (e.key === 'ArrowUp') camY -= step;
      else if (e.key === 'ArrowDown') camY += step;
      else if (e.key === '+' || e.key === '=' || e.key === ';') cell = Math.min(24, cell + 1);
      else if (e.key === '-') cell = Math.max(2, cell - 1);
      else if (e.key === 'c' || e.key === 'C') {
        camX = hereX;
        camY = hereY;
      } else if (e.key === 'm' || e.key === 'M') {
        closeSelf();
        return true;
      } else return false;
      draw();
      return true;
    },
    () => window.clearInterval(timer),
  );
  const closeSelf = () => closeModal();

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const toScreen = (tx: number, ty: number): [number, number] => [
    Math.round((tx - camX) * (cell / MOSAIC) + W / 2),
    Math.round((ty - camY) * (cell / MOSAIC) + H / 2 + 6),
  ];

  function draw(): void {
    ctx.fillStyle = '#07060f';
    ctx.fillRect(0, 0, W, H);

    for (const id of visited) {
      const p = content.world.get(id)!;
      const def = content.areas.get(id)!;
      const [sx, sy] = toScreen(p.x, p.y);
      const pw = Math.ceil((p.w / MOSAIC) * cell);
      const ph = Math.ceil((p.h / MOSAIC) * cell);
      if (def.resetOnEnter) {
        // 揺らぎ区域：形が変わるのでノイズ模様
        const rnd = makeRng(id);
        for (let y = 0; y < ph; y += 2) {
          for (let x = 0; x < pw; x += 2) {
            const v = 30 + Math.floor(rnd() * 50);
            ctx.fillStyle = `rgb(${v},${v - 4},${v + 12})`;
            ctx.fillRect(sx + x, sy + y, 2, 2);
          }
        }
      } else {
        const m = mosaicCache.get(id);
        if (m) {
          for (let my = 0; my < m.h; my++) {
            for (let mx = 0; mx < m.w; mx++) {
              const c = m.cells[my * m.w + mx];
              if (!c) continue;
              ctx.fillStyle = c;
              // 端のマスはエリアの大きさで切る（4 で割り切れない大きさのとき）
              const cw = Math.min(cell, pw - mx * cell);
              const ch = Math.min(cell, ph - my * cell);
              ctx.fillRect(sx + mx * cell, sy + my * cell, cw, ch);
            }
          }
        }
      }
      // 深いほど暗く
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.6, (def.depth - 1) * 0.1)})`;
      ctx.fillRect(sx, sy, pw, ph);
      ctx.strokeStyle = def.view === 'side' ? '#8fb0ff' : '#ffcf8a';
      ctx.globalAlpha = Math.max(0.35, 1 - (def.depth - 1) * 0.12);
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, pw - 1, ph - 1);
      ctx.globalAlpha = 1;
    }

    // エリアの名前（ほかの枠に隠れないよう、最後に下地つきで描く）
    if (cell >= 4) {
      ctx.font = '8px monospace';
      for (const id of visited) {
        const p = content.world.get(id)!;
        const [sx, sy] = toScreen(p.x, p.y);
        const name = content.areas.get(id)!.name;
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(7,6,15,0.85)';
        ctx.fillRect(sx, sy - 10, tw + 4, 10);
        ctx.fillStyle = '#e8e0ff';
        ctx.fillText(name, sx + 2, sy - 2);
      }
    }

    // 一度通ったワープ
    for (const w of content.map.warps) {
      if (!save.usedWarps.includes(w.id)) continue;
      const a = content.world.get(w.from.area);
      const b = content.world.get(w.to.area);
      if (!a || !b || !visited.includes(w.from.area) || !visited.includes(w.to.area)) continue;
      const [x1, y1] = toScreen(a.x + w.from.at[0] + 0.5, a.y + w.from.at[1] + 0.5);
      const [x2, y2] = toScreen(b.x + w.to.at[0] + 0.5, b.y + w.to.at[1] + 0.5);
      ctx.strokeStyle = '#b78cff';
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const arrow = (fx: number, fy: number, tx: number, ty: number) => {
        const ang = Math.atan2(ty - fy, tx - fx);
        ctx.fillStyle = '#b78cff';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 6 * Math.cos(ang - 0.5), ty - 6 * Math.sin(ang - 0.5));
        ctx.lineTo(tx - 6 * Math.cos(ang + 0.5), ty - 6 * Math.sin(ang + 0.5));
        ctx.fill();
      };
      arrow(x1, y1, x2, y2);
      if (w.bidirectional) arrow(x2, y2, x1, y1);
    }

    // 拠点（段階2以上どうしは点線でつなぐ）
    const bases = [...content.bases.values()].filter((b) => stageOf(save, b.area) > 0 && visited.includes(b.area));
    const pos = (area: string, spawn: string): [number, number] => {
      const p = content.world.get(area)!;
      const t = content.areas.get(area)!.spawns[spawn]!;
      return toScreen(p.x + t[0] + 0.5, p.y + t[1] + 0.5);
    };
    const linked = bases.filter((b) => stageOf(save, b.area) >= 2);
    ctx.strokeStyle = '#ffd27a';
    ctx.setLineDash([3, 3]);
    for (let i = 1; i < linked.length; i++) {
      const [x1, y1] = pos(linked[i - 1]!.area, linked[i - 1]!.spawn);
      const [x2, y2] = pos(linked[i]!.area, linked[i]!.spawn);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const b of bases) {
      const [x, y] = pos(b.area, b.spawn);
      ctx.fillStyle = '#ffd27a';
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 4, y);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 4, y);
      ctx.fill();
    }

    // 今いる所
    if (blink) {
      const [x, y] = toScreen(hereX, hereY);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }

    ctx.fillStyle = '#e8e0ff';
    ctx.font = '10px monospace';
    ctx.fillText(`地図　${content.areas.get(here.area)?.name ?? ''}`, 8, 14);
    ctx.font = '8px monospace';
    ctx.fillStyle = '#a99cc4';
    ctx.fillText('青枠 横 / 橙枠 見下ろし / ◆ 拠点 / 紫線 通ったワープ / 点線 拠点の移動', 8, H - 16);
    ctx.fillText('矢印 動かす　+ - 拡大縮小　C 今いる所　M / Esc 閉じる', 8, H - 6);
  }

  const timer = window.setInterval(() => {
    blink = !blink;
    draw();
  }, 450);
  draw();
}
