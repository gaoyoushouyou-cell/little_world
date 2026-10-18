import type Phaser from 'phaser';
import { TILE } from '../engine/constants';
import type { Content, LoadedArea } from '../engine/content';
import type { FrameInput } from '../engine/input';
import type { ObjectLayout } from '../engine/objects';
import type { Placement } from '../schema/objects';
import { stageOf, storageOf } from '../systems/bases';
import { footprint, placementProblem, type SceneObject, type Tile } from '../systems/building';
import { addItem, countItem, removeItem, type Slots } from '../systems/inventory';
import type { SaveStore } from '../systems/save';
import { hideBuildBar, showBuildBar, type BuildEntry } from '../ui/buildbar';
import type { Ui } from '../ui/ui';

/**
 * 建築モード（決定 51〜55）。拠点の中で B を押すと入る。
 * 予告を矢印（WASD）で動かし、Q / E で置く家具を選び、Enter で置き、X でしまい、R で左右反転、Esc / B で抜ける。
 * 置けるかどうかの判定は systems/building.ts、置いた物はセーブの上書き層（placed / hidden）に記録する。
 */

/** 建築モードがシーンから受け取るもの */
export interface BuildHost {
  scene: Phaser.Scene;
  content: Content;
  save: SaveStore;
  ui: Ui;
  area: LoadedArea;
  objects(): readonly SceneObject[];
  /** 物の並びが変わったので、表示と当たり判定を作り直す */
  rebuild(): void;
  /** プレイヤーの前のマス（予告を最初に出す場所） */
  frontTile(): Tile;
  /** プレイヤーが重なっているマス */
  playerTiles(): Tile[];
  /** 出入口・ワープ・出現位置のマス */
  blockedTiles(): Tile[];
  /** 出現位置（歩き始めるマス）と、歩いて行けなくしてはいけないマス */
  routeTiles(): { starts: Tile[]; targets: Tile[] };
  spriteFrame(sprite: string, anim: string, index: number): string;
}

/** 押し続けたときの繰り返し（フレーム数） */
const REPEAT_DELAY = 14;
const REPEAT_EVERY = 4;

export class BuildMode {
  active = false;
  private cursor: Tile = [0, 0];
  private selected = 0;
  private flipX = false;
  private ghost: Phaser.GameObjects.Image | null = null;
  private gfx: Phaser.GameObjects.Graphics | null = null;
  private held = 0;
  private heldDir = '';

  constructor(private readonly host: BuildHost) {}

  /** 拠点の中でだけ入れる。入れたら true */
  enter(): boolean {
    const { host } = this;
    if (stageOf(host.save.data, host.area.def.id) <= 0) {
      host.ui.toast('建築は拠点の中だけ');
      return false;
    }
    this.active = true;
    this.cursor = this.clamp(host.frontTile());
    this.gfx = host.scene.add.graphics().setDepth(10_000);
    this.render();
    return true;
  }

  exit(): void {
    this.active = false;
    this.ghost?.destroy();
    this.ghost = null;
    this.gfx?.destroy();
    this.gfx = null;
    hideBuildBar();
  }

  update(input: FrameInput): void {
    if (input.cancelPressed || input.buildPressed) {
      this.exit();
      return;
    }
    let changed = this.moveCursor(input);
    const n = this.entries().length;
    if (input.prevPressed && n) {
      this.selected = (this.selected - 1 + n) % n;
      changed = true;
    }
    if (input.nextPressed && n) {
      this.selected = (this.selected + 1) % n;
      changed = true;
    }
    if (input.flipPressed) {
      this.flipX = !this.flipX;
      changed = true;
    }
    if (input.placePressed) {
      this.place();
      changed = true;
    } else if (input.pickupPressed) {
      this.pickup();
      changed = true;
    }
    if (changed) this.render();
  }

  /** マウスで指したマスに予告を動かす */
  pointAt(tile: Tile): void {
    if (!this.active) return;
    const t = this.clamp(tile);
    if (t[0] === this.cursor[0] && t[1] === this.cursor[1]) return;
    this.cursor = t;
    this.render();
  }

  // ---- 置ける物 ----------------------------------------------------------

  /** 置き場所に使える入れ物（手持ちが先、次にこの拠点の倉庫） */
  private sources(): Slots[] {
    const { save, content, area } = this.host;
    return [save.data.pocket, storageOf(save.data, area.def.id, content.economy)];
  }

  /** 手持ちと倉庫にある家具（種類ごとの数） */
  entries(): BuildEntry[] {
    const { content } = this.host;
    const ids: string[] = [];
    for (const slots of this.sources()) for (const s of slots) if (s && content.items.get(s.item)?.kind === 'furniture' && !ids.includes(s.item)) ids.push(s.item);
    return ids.map((item) => ({ item, count: this.sources().reduce((n, slots) => n + countItem(slots, item), 0) }));
  }

  private candidate(): { placement: Placement; layout: ObjectLayout; footprint: Tile[]; sprite: string; anim: string } | null {
    const { content, area } = this.host;
    const entries = this.entries();
    if (this.selected >= entries.length) this.selected = Math.max(0, entries.length - 1);
    const entry = entries[this.selected];
    const objectId = entry ? content.items.get(entry.item)?.places : undefined;
    const def = objectId ? content.objects.get(objectId) : undefined;
    if (!def) return null;
    const placement: Placement = { object: def.id, at: this.cursor, offset: [0, 0], flipX: this.flipX, front: false };
    const layout = content.layoutIn(area.def, placement)!;
    const w = content.spriteSize(def.sprite, def.animation)?.w ?? TILE;
    return { placement, layout, footprint: footprint(placement.at, layout.cells, w), sprite: def.sprite, anim: def.animation };
  }

  private others() {
    const { content } = this.host;
    return this.host.objects().map((o) => ({
      obj: o,
      cells: o.layout.cells,
      footprint: footprint(o.placement.at, o.layout.cells, content.spriteSize(o.def.sprite, o.def.animation)?.w ?? TILE),
    }));
  }

  /** 置けるなら null、置けないなら理由 */
  problem(): string | null {
    const c = this.candidate();
    if (!c) return '置ける家具がない';
    const route = this.host.routeTiles();
    return placementProblem({
      tileSolid: this.host.area.tileSolid,
      others: this.others(),
      candidate: { cells: c.layout.cells, footprint: c.footprint },
      blocked: this.host.blockedTiles(),
      starts: route.starts,
      targets: route.targets,
      player: this.host.playerTiles(),
    });
  }

  private place(): void {
    const { host } = this;
    const c = this.candidate();
    const problem = this.problem();
    if (!c || problem) {
      host.ui.toast(problem ?? '置けない');
      return;
    }
    const entry = this.entries()[this.selected]!;
    if (!this.sources().some((slots) => removeItem(slots, entry.item, 1))) return;
    const id = host.area.def.id;
    (host.save.data.placed[id] ??= []).push({ object: c.placement.object, at: [...c.placement.at], flipX: c.placement.flipX });
    host.save.save();
    host.rebuild();
  }

  /** 予告のマスにある物をしまう */
  private pickup(): void {
    const { host } = this;
    const target = this.targetAt(this.cursor);
    if (!target) {
      host.ui.toast('ここにしまえる物はない');
      return;
    }
    const { obj } = target;
    const item = host.content.furnitureItemOf(obj.def.id);
    if (!item || (obj.source.kind === 'content' && !obj.def.movable)) {
      host.ui.toast(`${obj.def.name ?? obj.def.id}はしまえない`);
      return;
    }
    // 箱は空のときだけしまえる（決定 60）
    const rec = obj.source.kind === 'placed' ? host.save.data.placed[host.area.def.id]?.[obj.source.index] : undefined;
    if (rec?.contents?.some(Boolean)) {
      host.ui.toast(`${obj.def.name ?? obj.def.id}の中身を出してからしまう`);
      return;
    }
    const max = host.content.items.get(item)?.maxStack ?? 1;
    if (!this.sources().some((slots) => addItem(slots, item, 1, 1, max) === 0)) {
      host.ui.toast('持ち物も倉庫もいっぱい');
      return;
    }
    const id = host.area.def.id;
    if (obj.source.kind === 'placed') host.save.data.placed[id]?.splice(obj.source.index, 1);
    else (host.save.data.hidden[id] ??= []).push(obj.source.key);
    host.save.save();
    host.rebuild();
    host.ui.toast(`${host.content.items.get(item)?.name ?? item}をしまった`);
  }

  /** そのマスを占めている物（置いた物を先に探す） */
  private targetAt([x, y]: Tile) {
    const hits = this.others().filter((o) => [...o.footprint, ...o.cells].some(([cx, cy]) => cx === x && cy === y));
    return hits.find((h) => h.obj.source.kind === 'placed') ?? hits[0];
  }

  // ---- 表示 --------------------------------------------------------------

  private clamp([x, y]: Tile): Tile {
    const [w, h] = this.host.area.def.size;
    return [Math.max(0, Math.min(w - 1, x)), Math.max(0, Math.min(h - 1, y))];
  }

  private moveCursor(input: FrameInput): boolean {
    const dir = `${input.x},${input.y}`;
    if (input.x === 0 && input.y === 0) {
      this.held = 0;
      this.heldDir = '';
      return false;
    }
    if (dir !== this.heldDir) {
      this.heldDir = dir;
      this.held = 0;
    }
    const step = this.held === 0 || (this.held >= REPEAT_DELAY && (this.held - REPEAT_DELAY) % REPEAT_EVERY === 0);
    this.held++;
    if (!step) return false;
    this.cursor = this.clamp([this.cursor[0] + input.x, this.cursor[1] + input.y]);
    return true;
  }

  render(): void {
    const { host } = this;
    const c = this.candidate();
    const problem = this.problem();
    const ok = problem === null;
    const g = this.gfx!;
    g.clear();
    const color = ok ? 0x7dffa0 : 0xff6a7a;
    for (const [x, y] of c ? [...c.footprint, ...c.layout.cells] : [this.cursor]) {
      g.fillStyle(color, 0.22);
      g.fillRect(x * TILE, y * TILE, TILE, TILE);
      g.lineStyle(1, color, 0.9);
      g.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1);
    }
    const target = this.targetAt(this.cursor);
    if (target) {
      g.lineStyle(1, 0xffe08a, 0.9);
      for (const [x, y] of [...target.footprint, ...target.cells]) g.strokeRect(x * TILE + 1.5, y * TILE + 1.5, TILE - 3, TILE - 3);
    }
    if (c) {
      const key = host.spriteFrame(c.sprite, c.anim, 0);
      this.ghost ??= host.scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(10_001);
      this.ghost
        .setTexture(key)
        .setPosition(c.layout.anchorX, c.layout.anchorY)
        .setAngle(c.layout.angle)
        .setFlipX(this.flipX)
        .setAlpha(0.7)
        .setTint(ok ? 0xc8ffd4 : 0xff9aa6)
        .setVisible(true);
    } else this.ghost?.setVisible(false);
    const entries = this.entries();
    const targetName = target ? (target.obj.def.name ?? target.obj.def.id) : '';
    const canPick = !!target && (target.obj.source.kind === 'placed' || target.obj.def.movable);
    const rec = target?.obj.source.kind === 'placed' ? host.save.data.placed[host.area.def.id]?.[target.obj.source.index] : undefined;
    const pick = !canPick ? '' : rec?.contents?.some(Boolean) ? `${targetName}は中身があるのでしまえない` : `X で${targetName}をしまえる`;
    const status = c ? [problem ?? '置ける', pick].filter(Boolean).join('　') : pick;
    // 予告が画面の下半分にあるときは、帯を上に出して隠さない
    const cam = host.scene.cameras.main;
    const top = (this.cursor[1] + 0.5) * TILE - cam.scrollY > cam.height / 2;
    showBuildBar(host.content, entries, this.selected, status, ok || (!c && canPick), top);
  }
}
