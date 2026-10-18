import Phaser from 'phaser';
import type { Content, LoadedArea } from '../engine/content';
import { STEP_MS, TILE, VIEW_H, VIEW_W } from '../engine/constants';
import { dirFromVelocity, resolveAnimation, type Dir } from '../engine/facing';
import { Controls, type FrameInput } from '../engine/input';
import { gravityFrame, stepBody, type Body, type SolidQuery, type StepParams } from '../engine/physics';
import { gridToCanvas, makeCanvas } from '../engine/pixelart';
import { compareFrame, pickBackground, toScreen, type FrameReport, type Screen } from '../engine/rendercheck';
import { checkEdge, placeArrival, stepParamsFor, type Arrival } from '../engine/travel';
import { makeSolidQuery, wrapsX, wrapsY } from '../engine/world';
import type { PlacedObject } from '../engine/content';
import { interactionPlugins, layerPlugins } from '../registry';
import type { LayerInstance } from '../plugins/layers/_types';
import type { GameServices } from '../plugins/interactions/_types';
import type { Trigger } from '../schema/area';
import { ensureInitialBases } from '../systems/bases';
import { scatterPickups, type Pickup } from '../systems/gather';
import { addItem, emptySlots, resize } from '../systems/inventory';
import type { SaveStore } from '../systems/save';
import { openMap } from '../ui/mapscreen';
import { setDebug, setPrompt, showAreaTitle } from '../ui/overlay';
import type { Ui } from '../ui/ui';
import { BuildMode } from './buildmode';
import { composeObjects, composeSolid, type SceneObject, type Tile } from '../systems/building';
import type { SolidMap } from '../engine/tilegrid';
import type { PlacedRecord } from '../systems/save';
import { grantStarter, stageOf, storageOf } from '../systems/bases';
import { openCrafting } from '../plugins/interactions/_crafting';

export interface AreaSceneData {
  areaId: string;
  arrival: Arrival;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Portal {
  kind: 'exit' | 'warp';
  /** map.json のワープの id（地図に線を出すために記録する） */
  warpId?: string;
  rect: Rect;
  trigger: Trigger;
  to: { areaId: string; tile: [number, number] };
}

/** 近くで「調べる」ことができる物 */
interface Interactable {
  obj: PlacedObject;
  /** この範囲にプレイヤーが重なると調べられる（当たり判定のまわり1マス） */
  zone: Rect;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const DEV_STATE_KEY = 'little-world:dev-position';

/** 何も押していない入力 */
const NEUTRAL: FrameInput = {
  x: 0,
  y: 0,
  jumpHeld: false,
  jumpPressed: false,
  interactPressed: false,
  debugPressed: false,
  inventoryPressed: false,
  mapPressed: false,
  buildPressed: false,
  prevPressed: false,
  nextPressed: false,
  placePressed: false,
  pickupPressed: false,
  flipPressed: false,
  cancelPressed: false,
  craftPressed: false,
};

export class AreaScene extends Phaser.Scene {
  private content!: Content;
  private area!: LoadedArea;
  private sceneData!: AreaSceneData;
  private controls!: Controls;
  private body!: Body;
  private solid!: SolidQuery;
  private params!: StepParams;
  private layers: LayerInstance[] = [];
  /** layers と同じ順の名前（"番号:種類"。描画の検証の報告に使う） */
  private layerNames: string[] = [];
  private portals: Portal[] = [];
  private portalGfx!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Image;
  private tracked: string[] = [];
  private objectImages: { obj: PlacedObject; image: Phaser.GameObjects.Image; sprite: string; animation: string }[] = [];
  /** 画面にある物（原本の物からしまったものを除き、置いた物を足したもの） */
  private sceneObjects: SceneObject[] = [];
  /** タイルと物を合わせた当たり判定 */
  private solidMap!: SolidMap;
  private build!: BuildMode;
  private interactables: Interactable[] = [];
  private pickups: { p: Pickup; image: Phaser.GameObjects.Image; baseY: number }[] = [];
  private save!: SaveStore;
  private ui!: Ui;
  private services!: GameServices;
  private fullWarned = 0;
  private playerDepth = 0;

  private acc = 0;
  private worldTime = 0;
  private stepCount = 0;
  private camX = 0;
  private camY = 0;
  private transitioning = false;
  /** 到着時に重なっていた「触れると入る」出入口は、一度離れるまで反応しない */
  private touchArmed = false;
  private facing = 1;
  private dir: Dir = 'down';
  private debug = false;
  /** 描画の検証中はゲームを止める（カメラと時刻を動かさない） */
  private renderChecking = false;

  constructor() {
    super('area');
  }

  init(data: AreaSceneData): void {
    this.sceneData = data;
    this.layers = [];
    this.layerNames = [];
    this.portals = [];
    this.tracked = [];
    this.objectImages = [];
    this.interactables = [];
    this.pickups = [];
    this.acc = 0;
    this.worldTime = 0;
    this.transitioning = false;
    this.touchArmed = false;
  }

  create(): void {
    this.content = this.registry.get('content') as Content;
    this.save = this.registry.get('save') as SaveStore;
    this.ui = this.registry.get('ui') as Ui;
    this.debug = this.registry.get('debug') === true;
    const area = this.content.getLoaded(this.sceneData.areaId);
    if (!area) throw new Error(`エリア ${this.sceneData.areaId} が読み込まれていない`);
    this.area = area;
    const def = area.def;

    ensureInitialBases(this.save.data, [...this.content.bases.values()]);
    grantStarter(this.save.data, [...this.content.bases.values()], this.content.economy, (item) => this.content.items.get(item)?.maxStack ?? 99);
    this.save.markVisited(def.id);
    this.save.save();
    this.services = this.makeServices();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of this.tracked) this.textures.remove(key);
    });

    // レイヤー：プレイヤーは最後の tiles レイヤーのすぐ手前に置く
    const lastTiles = def.layers.map((l) => l.type).lastIndexOf('tiles');
    const playerDepth = (lastTiles < 0 ? 0 : lastTiles) * 10 + 5;
    def.layers.forEach((layer, i) => {
      const plugin = layerPlugins.get(layer.type);
      const params = area.layerParams[i];
      if (!plugin || params === undefined) return;
      this.layers.push(
        plugin.create(
          { scene: this, area, tiles: this.content.tiles, images: this.content.images, depth: i * 10, track: (key) => this.tracked.push(key) },
          params,
        ),
      );
      this.layerNames.push(`${i}:${layer.type}`);
    });

    this.params = stepParamsFor(def);
    this.composeWorld();

    this.body = placeArrival(this.sceneData.arrival, this.params, this.solid);
    this.buildPortals();
    this.playerDepth = playerDepth;
    // 出入口は床の上（物やプレイヤーより奥）
    this.portalGfx = this.add.graphics().setDepth(playerDepth - 5);
    this.player = this.add.image(0, 0, this.playerFrame('idle', 0)).setOrigin(0.5, 1).setDepth(playerDepth);
    this.buildObjects();
    this.buildInteractables();
    this.buildPickups();
    this.build = new BuildMode(this.buildHost());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.build.exit());
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.build.pointAt([Math.floor(p.worldX / TILE), Math.floor(p.worldY / TILE)]));

    this.controls = new Controls(this);
    this.cameras.main.setRoundPixels(true);
    this.updateCamera(true);
    this.updatePlayerSprite();
    this.drawPortals();
    for (const l of this.layers) l.update?.(this.cameras.main, 0);
    this.cameras.main.fadeIn(this.sceneData.arrival.kind === 'edge' ? 120 : 400, 0, 0, 0);

    if (this.sceneData.arrival.kind !== 'restore') showAreaTitle(def.name, `深さ ${def.depth}`);
    setPrompt(null);
    if (import.meta.env.DEV) this.installDevHook();
  }

  // ---- 置いた物 ---------------------------------------------------------

  /**
   * 重なり順。見下ろしでは足元が下にあるものほど手前（プレイヤーと物を混ぜて並べる）。
   * 横視点では物はプレイヤーの奥、front の物だけ手前。
   */
  private depthFor(bottomY: number, front = false): number {
    if (this.params.view !== 'top') return this.playerDepth + (front ? 1 : -1);
    const H = this.area.def.size[1] * TILE;
    const t = Math.max(0, Math.min(1, bottomY / H));
    return this.playerDepth - 4 + t * 8;
  }

  private buildObjects(): void {
    const def = this.area.def;
    const W = def.size[0] * TILE;
    const H = def.size[1] * TILE;
    const copiesX = wrapsX(def.physics.wrap) ? [-W, 0, W] : [0];
    const copiesY = wrapsY(def.physics.wrap) ? [-H, 0, H] : [0];
    for (const obj of this.sceneObjects) {
      const { layout, placement } = obj;
      for (const ox of copiesX) {
        for (const oy of copiesY) {
          const image = this.add
            .image(layout.anchorX + ox, layout.anchorY + oy, this.spriteFrame(obj.def.sprite, obj.def.animation, 0))
            .setOrigin(0.5, 1)
            .setAngle(layout.angle)
            .setFlipX(placement.flipX)
            .setDepth(this.depthFor(layout.anchorY + oy, placement.front));
          this.objectImages.push({ obj, image, sprite: obj.def.sprite, animation: obj.def.animation });
        }
      }
    }
  }

  /** 調べられる物と、その範囲（当たり判定のまわり1マス。当たり判定がなければ絵のまわり） */
  private buildInteractables(): void {
    for (const obj of this.sceneObjects) {
      if (!obj.def.interact) continue;
      const cells = obj.layout.cells;
      let zone: Rect;
      if (cells.length) {
        const xs = cells.map((c) => c[0]);
        const ys = cells.map((c) => c[1]);
        const x0 = Math.min(...xs) - 1;
        const y0 = Math.min(...ys) - 1;
        zone = { x: x0 * TILE, y: y0 * TILE, w: (Math.max(...xs) - x0 + 2) * TILE, h: (Math.max(...ys) - y0 + 2) * TILE };
      } else {
        const size = this.content.spriteSize(obj.def.sprite, obj.def.animation) ?? { w: 16, h: 16 };
        const r = Math.max(size.w, size.h) / 2 + TILE / 2;
        const cy = obj.layout.anchorY + (obj.layout.angle === 180 ? size.h / 2 : -size.h / 2);
        zone = { x: obj.layout.anchorX - r, y: cy - r, w: r * 2, h: r * 2 };
      }
      this.interactables.push({ obj, zone });
    }
  }

  private nearInteractable(): { it: Interactable; label: string } | undefined {
    const b = { x: this.body.x, y: this.body.y, w: this.body.w, h: this.body.h };
    for (const it of this.interactables) {
      if (!overlaps(b, it.zone)) continue;
      const interact = it.obj.def.interact!;
      const plugin = interactionPlugins.get(interact.type);
      if (!plugin) continue;
      const params = plugin.params.parse(interact);
      const label = plugin.label(this.services, it.obj, params);
      if (label) return { it, label };
    }
    return undefined;
  }

  /** 揺らぎ区域：入るたびに素材が散らばる（拾った物は、出て入り直すと別の並びになる） */
  private buildPickups(): void {
    const def = this.area.def;
    if (!def.resetOnEnter || !def.gather) return;
    const start = { x: this.body.x, y: this.body.y, w: this.body.w, h: this.body.h };
    const list = scatterPickups(def.gather, {
      areaId: def.id,
      visit: this.save.data.visits[def.id] ?? 0,
      depth: def.depth,
      solid: this.solidMap,
      avoid: (x, y) => {
        const r = { x: x * TILE, y: y * TILE, w: TILE, h: TILE };
        const near = { x: start.x - TILE * 2, y: start.y - TILE * 2, w: start.w + TILE * 4, h: start.h + TILE * 4 };
        return overlaps(r, near) || this.portals.some((p) => overlaps(r, p.rect));
      },
    });
    for (const p of list) {
      const icon = this.content.items.get(p.item)?.icon;
      if (!icon) continue;
      const x = p.tile[0] * TILE + TILE / 2;
      const y = (p.tile[1] + 1) * TILE - 1;
      const image = this.add.image(x, y, this.spriteFrame(icon, 'idle', 0)).setOrigin(0.5, 1).setDepth(this.depthFor(y));
      this.pickups.push({ p, image, baseY: y });
    }
  }

  private collectPickups(): void {
    const b = { x: this.body.x, y: this.body.y, w: this.body.w, h: this.body.h };
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i]!;
      const r = { x: pk.p.tile[0] * TILE + 3, y: pk.p.tile[1] * TILE + 3, w: TILE - 6, h: TILE - 6 };
      if (!overlaps(b, r)) continue;
      const item = this.content.items.get(pk.p.item)!;
      if (addItem(this.save.data.pocket, item.id, pk.p.quality, 1, item.maxStack) > 0) {
        if (this.stepCount - this.fullWarned > 120) {
          this.ui.toast('持ち物がいっぱい');
          this.fullWarned = this.stepCount;
        }
        continue;
      }
      pk.image.destroy();
      this.pickups.splice(i, 1);
      this.save.save();
      this.ui.toast(`${item.name} ×1`);
    }
    for (const pk of this.pickups) pk.image.y = pk.baseY - Math.round((Math.sin(this.worldTime / 400 + pk.p.tile[0]) + 1) * 1.5);
  }

  private makeServices(): GameServices {
    return {
      content: this.content,
      save: this.save,
      area: this.area,
      ui: this.ui,
      sleep: (baseArea, bed) => {
        const base = this.content.bases.get(baseArea);
        if (!base) return;
        this.ui.close();
        // 置いたベッドなら、そのベッドのところで目覚める（原本のベッドは拠点の決まった場所）
        const placedBed = bed && 'source' in bed && (bed as SceneObject).source.kind === 'placed' ? bed.placement.at : null;
        this.save.data.respawn = placedBed ? { area: baseArea, tile: [placedBed[0], placedBed[1]] } : { area: baseArea, spawn: base.spawn };
        this.save.save();
        const tile = placedBed ?? this.content.areas.get(baseArea)!.spawns[base.spawn]!;
        this.goTo({ areaId: baseArea, arrival: { kind: 'tile', tile } }, 900, () => this.ui.toast('眠った。ここで目覚める'));
      },
      travelToBase: (baseArea) => {
        const base = this.content.bases.get(baseArea);
        if (!base) return;
        this.ui.close();
        const tile = this.content.areas.get(baseArea)!.spawns[base.spawn]!;
        this.goTo({ areaId: baseArea, arrival: { kind: 'tile', tile } }, 500);
      },
      craftSources: () => {
        const id = this.area.def.id;
        if (stageOf(this.save.data, id) <= 0) return [this.save.data.pocket];
        const chests = (this.save.data.placed[id] ?? []).flatMap((r) => (r.contents ? [r.contents] : []));
        return [this.save.data.pocket, storageOf(this.save.data, id, this.content.economy), ...chests];
      },
      craftOutputs: () => {
        const id = this.area.def.id;
        return stageOf(this.save.data, id) > 0 ? [this.save.data.pocket, storageOf(this.save.data, id, this.content.economy)] : [this.save.data.pocket];
      },
      containerOf: (obj, capacity) => {
        const o = obj as Partial<SceneObject>;
        if (o.source?.kind !== 'placed') return null;
        const rec = this.save.data.placed[this.area.def.id]?.[o.source.index];
        if (!rec) return null;
        rec.contents = resize(rec.contents ?? emptySlots(capacity), capacity);
        return rec.contents;
      },
      setObjectSprite: (obj, spriteId) => {
        for (const o of this.objectImages) {
          if (o.obj !== obj) continue;
          o.sprite = spriteId ?? obj.def.sprite;
          o.animation = spriteId ? 'idle' : obj.def.animation;
          o.image.setTexture(this.spriteFrame(o.sprite, o.animation, 0));
        }
      },
    };
  }

  private animateObjects(): void {
    for (const o of this.objectImages) {
      const sprite = this.content.sprites.get(o.sprite);
      const frames = sprite?.animations[o.animation];
      if (!sprite || !frames || frames.length < 2) continue;
      o.image.setTexture(this.spriteFrame(o.sprite, o.animation, Math.floor(this.stepCount / sprite.frameSteps)));
    }
  }

  // ---- 出入口とワープ ---------------------------------------------------

  /** 出入口の範囲。at は足元のタイルで、重力と逆の向きに size[1] だけ伸びる */
  private portalRect(at: [number, number], size: [number, number] | undefined) {
    const view = this.params.view;
    const [w, h] = size ?? (view === 'side' ? [1, 2] : [1, 1]);
    const { axis, sign } = gravityFrame(this.params.gravity);
    let [x, y] = at;
    if (view === 'side' && axis === 'y' && sign > 0) y = y - h + 1;
    if (view === 'side' && axis === 'x' && sign > 0) x = x - w + 1;
    const sw = view === 'side' && axis === 'x' ? h : w;
    const sh = view === 'side' && axis === 'x' ? w : h;
    return { x: x * TILE, y: y * TILE, w: sw * TILE, h: sh * TILE };
  }

  private buildPortals(): void {
    const id = this.area.def.id;
    for (const exit of this.area.def.exits) {
      const target = this.content.areas.get(exit.to);
      const tile = target?.spawns[exit.spawn];
      if (!tile) continue;
      this.portals.push({ kind: 'exit', rect: this.portalRect(exit.at, exit.size), trigger: exit.trigger, to: { areaId: exit.to, tile } });
    }
    for (const warp of this.content.map.warps) {
      if (warp.from.area === id) {
        this.portals.push({ kind: 'warp', warpId: warp.id, rect: this.portalRect(warp.from.at, undefined), trigger: warp.trigger, to: { areaId: warp.to.area, tile: warp.to.at } });
      }
      if (warp.bidirectional && warp.to.area === id) {
        this.portals.push({ kind: 'warp', warpId: warp.id, rect: this.portalRect(warp.to.at, undefined), trigger: warp.trigger, to: { areaId: warp.from.area, tile: warp.from.at } });
      }
    }
  }

  private drawPortals(): void {
    const g = this.portalGfx;
    g.clear();
    const pulse = 0.55 + 0.25 * Math.sin(this.worldTime / 500);
    for (const p of this.portals) {
      const color = p.kind === 'warp' ? 0xb78cff : 0xffc36b;
      const { x, y, w, h } = p.rect;
      g.fillStyle(color, 0.12 * pulse);
      g.fillRect(x, y, w, h);
      g.fillStyle(color, 0.35 * pulse);
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      g.lineStyle(1, color, 0.9 * pulse);
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }

  private overlappingPortal(): Portal | undefined {
    const b = this.body;
    return this.portals.find(
      ({ rect: r }) => b.x < r.x + r.w && r.x < b.x + b.w && b.y < r.y + r.h && r.y < b.y + b.h,
    );
  }

  // ---- 移動 -------------------------------------------------------------

  private goTo(data: AreaSceneData, fadeMs: number, after?: () => void): void {
    if (this.transitioning) return;
    this.transitioning = true;
    setPrompt(null);
    const fade = new Promise<void>((resolve) => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
      this.cameras.main.fadeOut(fadeMs, 0, 0, 0);
    });
    Promise.all([fade, this.content.loadWithNeighbors(data.areaId)])
      .then(() => {
        this.scene.restart(data);
        after?.();
      })
      .catch((e: unknown) => {
        console.error(e);
        this.transitioning = false;
        this.cameras.main.fadeIn(200, 0, 0, 0);
      });
  }

  /** 端を越えたか、ループする端を回り込んだかを調べる */
  private checkEdges(): void {
    const r = checkEdge(this.body, this.area, this.params, this.content.world);
    if (r.kind === 'wrapped') {
      this.camX += r.dx;
      this.camY += r.dy;
    } else if (r.kind === 'cross') {
      this.goTo({ areaId: r.to.id, arrival: r.arrival }, 120);
    }
  }

  update(_time: number, delta: number): void {
    const input = this.controls.read();
    if (input.debugPressed) {
      this.debug = !this.debug;
      this.registry.set('debug', this.debug);
      if (!this.debug) setDebug(null);
    }
    if (this.transitioning || this.renderChecking) return;
    // 画面（一覧・倉庫・地図）を開いている間はゲームを止める
    if (this.ui.isOpen()) {
      setPrompt(null);
      return;
    }
    if (input.inventoryPressed) {
      const id = this.area.def.id;
      const stage = stageOf(this.save.data, id);
      // 拠点の中なら、Q で倉庫とこのエリアに置いた箱へ同じ物をまとめて入れられる（決定 61）
      const quickTargets =
        stage > 0
          ? [
              { title: stage >= 2 ? '夢の回廊' : '倉庫', slots: storageOf(this.save.data, id, this.content.economy) },
              ...(this.save.data.placed[id] ?? []).filter((r) => r.contents).map((r) => ({ title: this.content.objects.get(r.object)?.name ?? '箱', slots: r.contents! })),
            ]
          : [];
      this.ui.storage({ title: '手持ち', slots: this.save.data.pocket, showWeight: true }, null, () => this.save.save(), undefined, {
        quickTargets,
        onCraft: () => {
          this.ui.close();
          openCrafting(this.services, 'hand');
        },
      });
      return;
    }
    if (this.build.active) {
      this.build.update(input);
      this.advance(NEUTRAL, 0);
      return;
    }
    if (input.buildPressed) {
      this.build.enter();
      return;
    }
    if (input.craftPressed) {
      openCrafting(this.services, 'hand');
      return;
    }
    if (input.mapPressed) {
      void openMap(this.content, this.save.data, { area: this.area.def.id, x: this.body.x + this.body.w / 2, y: this.body.y + this.body.h / 2 });
      return;
    }

    this.acc += Math.min(delta, 100) * this.area.def.physics.timeScale;
    let steps = 0;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      steps++;
    }
    this.advance(input, steps);
  }

  /** 物理を steps ステップ進め、出入口を調べて表示を更新する */
  advance(input: FrameInput, steps: number): void {
    for (let i = 0; i < steps; i++) {
      stepBody(this.body, { x: input.x, y: input.y, jumpHeld: input.jumpHeld, jumpPressed: i === 0 && input.jumpPressed }, this.params, this.solid);
      this.stepCount++;
      this.worldTime += STEP_MS;
      this.checkEdges();
      if (this.transitioning) return;
    }

    const portal = this.overlappingPortal();
    if (!portal) this.touchArmed = true;
    const enter = (p: Portal) => {
      if (p.warpId) {
        this.save.markWarp(p.warpId);
        this.save.save();
      }
      this.goTo({ areaId: p.to.areaId, arrival: { kind: 'tile', tile: p.to.tile } }, 400);
    };
    if (portal?.trigger === 'interact') {
      setPrompt('E', portal.kind === 'warp' ? 'ふれる' : '入る');
      if (input.interactPressed) enter(portal);
    } else if (portal?.trigger === 'touch' && this.touchArmed) {
      setPrompt(null);
      enter(portal);
    } else {
      const near = this.nearInteractable();
      setPrompt(near ? 'E' : null, near?.label ?? '');
      if (near && input.interactPressed) {
        const interact = near.it.obj.def.interact!;
        const plugin = interactionPlugins.get(interact.type)!;
        setPrompt(null);
        plugin.run(this.services, near.it.obj, plugin.params.parse(interact));
      }
    }
    this.collectPickups();

    this.updateCamera(false);
    this.updatePlayerSprite();
    this.drawPortals();
    this.animateObjects();
    for (const l of this.layers) l.update?.(this.cameras.main, this.worldTime);
    this.updateDebug();
    if (import.meta.env.DEV && this.stepCount % 30 === 0) this.saveDevPosition();
  }

  // ---- 表示 -------------------------------------------------------------

  private updateCamera(snap: boolean): void {
    const def = this.area.def;
    const W = def.size[0] * TILE;
    const H = def.size[1] * TILE;
    const tx = this.body.x + this.body.w / 2 - VIEW_W / 2;
    const ty = this.body.y + this.body.h / 2 - VIEW_H / 2;
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      this.camX += (tx - this.camX) * 0.12;
      this.camY += (ty - this.camY) * 0.12;
    }
    const clamp = (v: number, size: number, view: number) => (size <= view ? (size - view) / 2 : Math.max(0, Math.min(size - view, v)));
    if (!wrapsX(def.physics.wrap)) this.camX = clamp(this.camX, W, VIEW_W);
    if (!wrapsY(def.physics.wrap)) this.camY = clamp(this.camY, H, VIEW_H);
    this.cameras.main.setScroll(Math.round(this.camX), Math.round(this.camY));
  }

  /** スプライトのコマのテクスチャ（初めて使うときに作り、以後は使い回す） */
  private spriteFrame(spriteId: string, anim: string, index: number): string {
    const sprite = this.content.sprites.get(spriteId);
    const frames = sprite?.animations[anim] ?? sprite?.animations['idle'];
    const i = frames ? index % frames.length : 0;
    const key = `sprite:${spriteId}:${anim}:${i}`;
    if (!this.textures.exists(key)) {
      const rows = frames?.[i] ?? ['#'];
      this.textures.addCanvas(key, gridToCanvas(sprite?.palette ?? { '#': '#ffffff' }, rows));
    }
    return key;
  }

  /** プレイヤーの見た目（map.json の player.sprite） */
  private get playerSprite(): string {
    return this.content.map.player.sprite;
  }

  private playerFrame(anim: string, index: number): string {
    return this.spriteFrame(this.playerSprite, anim, index);
  }

  private updatePlayerSprite(): void {
    const b = this.body;
    const { axis, sign } = gravityFrame(this.params.gravity);
    const top = this.params.view === 'top' || axis === null;
    let angle = 0;
    let lateral = b.vx;
    let feetX = b.x + b.w / 2;
    let feetY = b.y + b.h;
    if (!top && axis === 'y' && sign < 0) {
      angle = 180;
      lateral = -b.vx;
      feetY = b.y;
    } else if (!top && axis === 'x') {
      angle = sign > 0 ? -90 : 90;
      lateral = sign > 0 ? -b.vy : b.vy;
      feetX = sign > 0 ? b.x + b.w : b.x;
      feetY = b.y + b.h / 2;
    }
    const moving = top ? Math.hypot(b.vx, b.vy) > 0.2 : Math.abs(lateral) > 0.2 && b.grounded;
    if (Math.abs(lateral) > 0.05) this.facing = lateral > 0 ? 1 : -1;
    if (top) this.dir = dirFromVelocity(b.vx, b.vy, this.dir);
    else this.dir = this.facing > 0 ? 'right' : 'left';

    const sprite = this.content.sprites.get(this.playerSprite);
    const frameSteps = sprite?.frameSteps ?? 8;
    const { anim, flipX } = resolveAnimation((name) => !!sprite?.animations[name], moving ? 'walk' : 'idle', top ? 'top' : 'side', this.dir);
    const key = this.playerFrame(anim, Math.floor(this.stepCount / (moving ? frameSteps : frameSteps * 4)));
    this.player
      .setTexture(key)
      .setAngle(angle)
      .setFlipX(flipX)
      .setPosition(Math.round(feetX), Math.round(feetY))
      .setDepth(this.params.view === 'top' ? this.depthFor(feetY) + 0.001 : this.playerDepth);
  }

  private updateDebug(): void {
    if (!this.debug) return;
    const b = this.body;
    const def = this.area.def;
    const neighbors = this.content.world.neighbors(def.id).map((n) => n.id).join(', ') || 'なし';
    setDebug(
      [
        `${def.id}（${def.name}）`,
        `視点 ${def.view} / 深さ ${def.depth} / 時間 ×${def.physics.timeScale} / ループ ${def.physics.wrap}`,
        `重力 [${this.params.gravity.join(', ')}]`,
        `位置 タイル (${Math.floor((b.x + b.w / 2) / TILE)}, ${Math.floor((b.y + b.h / 2) / TILE)})`,
        `速度 (${b.vx.toFixed(2)}, ${b.vy.toFixed(2)}) ${b.grounded ? '接地' : ''}`,
        `隣 ${neighbors}`,
        `fps ${Math.round(this.game.loop.actualFps)}`,
      ].join('\n'),
    );
  }

  /**
   * 開発中だけのテスト用フック。画面が裏にあってフレームが間引かれていても、
   * ブラウザのコンソールから決まったステップ数だけ動かして確かめられる。
   *   __lw.run({ x: 1 }, 120)          右へ 120 ステップ
   *   __lw.run({ interactPressed: true }, 1)
   *   __lw.state()
   *   __lw.craft('workbench')          加工の一覧を開く
   *   await __lw.checkRender()          描画の検証（レイヤーごとに、期待する画面と実際の画面を1ドットずつ比べる）
   */
  private installDevHook(): void {
    const idle = NEUTRAL;
    (window as unknown as { __lw: unknown }).__lw = {
      run: (input: Partial<FrameInput>, steps: number) => {
        if (!this.transitioning) this.advance({ ...idle, ...input }, steps);
        return this.devState();
      },
      state: () => this.devState(),
      /** 描画の検証。画面が表示されていないと描画が止まるので、組み込みブラウザの画面を出した状態で実行する */
      checkRender: () => this.checkRender(),
      /** 加工の一覧を開く（C・作業台と同じ。画面が隠れていてゲームが止まっていても開ける） */
      craft: (station: 'hand' | 'workbench' = 'hand') => openCrafting(this.services, station),
      /** 地図を開く（M と同じ） */
      map: () => openMap(this.content, this.save.data, { area: this.area.def.id, x: this.body.x + this.body.w / 2, y: this.body.y + this.body.h / 2 }),
    };
  }

  /**
   * 描画の検証（engine/rendercheck.ts）。expect を持つレイヤーごとに、そのレイヤーだけを見えるようにし、
   * 背景をレイヤーで使っていない色にして画面を撮り、期待した画面と1ドットずつ比べる
   */
  private async checkRender(): Promise<(FrameReport & { layer: string })[]> {
    if (this.renderChecking) throw new Error('描画の検証はすでに実行中');
    const cam = this.cameras.main;
    if (this.transitioning || cam.fadeEffect.isRunning) throw new Error('エリアの切り替え中・フェード中は検証できない');
    this.renderChecking = true;
    const children = [...this.children.list] as (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible)[];
    const visible = children.map((o) => o.visible);
    const bg = cam.backgroundColor.color32;
    const reports: (FrameReport & { layer: string })[] = [];
    try {
      for (const [i, layer] of this.layers.entries()) {
        const name = this.layerNames[i]!;
        if (!layer.expect || !layer.objects) continue;
        const expected = layer.expect(cam, this.worldTime);
        if (expected.skip) {
          reports.push({ layer: name, ...compareFrame({ width: 0, height: 0, data: new Uint8Array() }, expected, [0, 0, 0]) });
          continue;
        }
        const background = pickBackground(expected.colors);
        const own = new Set<Phaser.GameObjects.GameObject>(layer.objects);
        children.forEach((o) => o.setVisible?.(own.has(o)));
        cam.setBackgroundColor(Phaser.Display.Color.GetColor(...background));
        layer.update?.(cam, this.worldTime);
        const shot = toScreen(await this.snapshot(), VIEW_W, VIEW_H);
        reports.push({ layer: name, ...compareFrame(shot, expected, background) });
      }
    } finally {
      children.forEach((o, k) => o.setVisible?.(visible[k]!));
      cam.setBackgroundColor(bg);
      this.renderChecking = false;
    }
    return reports;
  }

  /** 次に描かれた画面を RGBA で受け取る */
  private snapshot(): Promise<Screen> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('画面が描かれない（画面が隠れていると描画が止まる）')), 3000);
      this.game.renderer.snapshot((img) => {
        clearTimeout(timer);
        const el = img as HTMLImageElement;
        const done = () => {
          const [canvas, c2d] = makeCanvas(el.width, el.height);
          c2d.drawImage(el, 0, 0);
          resolve({ width: el.width, height: el.height, data: c2d.getImageData(0, 0, el.width, el.height).data });
        };
        if (el.complete) done();
        else el.onload = done;
      });
    });
  }

  // ---- 建築モード -------------------------------------------------------

  /** 物と当たり判定を、原本と上書き層（置いた物・しまった物）から組み立てる */
  private composeWorld(): void {
    const def = this.area.def;
    this.sceneObjects = composeObjects(this.area, this.save.data.placed[def.id] ?? [], this.save.data.hidden[def.id] ?? [], (rec) => this.placedObject(rec));
    this.solidMap = composeSolid(this.area.tileSolid, this.sceneObjects.map((o) => o.layout.cells));
    this.solid = makeSolidQuery({ id: def.id, solid: this.solidMap, wrap: def.physics.wrap }, this.content.world, (id) => (id === def.id ? this.solidMap : this.content.getLoaded(id)?.solid));
  }

  private placedObject(rec: PlacedRecord): PlacedObject | undefined {
    const def = this.content.objects.get(rec.object);
    if (!def) return undefined;
    const placement = { object: rec.object, at: rec.at, offset: [0, 0] as [number, number], flipX: rec.flipX, front: false };
    const layout = this.content.layoutIn(this.area.def, placement);
    return layout ? { placement, def, layout } : undefined;
  }

  /** 物を置いた・しまったあと：表示・調べられる物・当たり判定を作り直す */
  private rebuildObjects(): void {
    for (const o of this.objectImages) o.image.destroy();
    this.objectImages = [];
    this.interactables = [];
    this.composeWorld();
    this.buildObjects();
    this.buildInteractables();
  }

  private buildHost() {
    const tilesOf = (r: Rect): Tile[] => {
      const out: Tile[] = [];
      for (let y = Math.floor(r.y / TILE); y < Math.ceil((r.y + r.h) / TILE); y++) for (let x = Math.floor(r.x / TILE); x < Math.ceil((r.x + r.w) / TILE); x++) out.push([x, y]);
      return out;
    };
    const edgeOpenings = (): Tile[] => {
      const { w, h } = this.area.tileSolid;
      const out: Tile[] = [];
      for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!this.area.tileSolid.isSolid(x, y)) out.push([x, y]);
      for (let y = 1; y < h - 1; y++) for (const x of [0, w - 1]) if (!this.area.tileSolid.isSolid(x, y)) out.push([x, y]);
      return out;
    };
    const spawnTiles = (): Tile[] => {
      const out: Tile[] = [];
      for (const t of Object.values(this.area.def.spawns)) {
        out.push([t[0], t[1]]);
        // 横視点では体が 2 マスの高さなので、重力と逆の向きのマスもあける
        if (this.params.view === 'side') out.push([t[0], t[1] - gravityFrame(this.params.gravity).sign]);
      }
      return out;
    };
    return {
      scene: this,
      content: this.content,
      save: this.save,
      ui: this.ui,
      area: this.area,
      objects: () => this.sceneObjects,
      rebuild: () => this.rebuildObjects(),
      playerTiles: () => tilesOf(this.body),
      frontTile: (): Tile => {
        const b = this.body;
        const cx = Math.floor((b.x + b.w / 2) / TILE);
        if (this.params.view === 'top') {
          const feet = Math.floor((b.y + b.h - 1) / TILE);
          const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.dir];
          return [cx + d[0]!, feet + d[1]!];
        }
        const down = gravityFrame(this.params.gravity).sign > 0;
        return [cx + this.facing, Math.floor((down ? b.y + b.h - 1 : b.y) / TILE)];
      },
      blockedTiles: () => [...this.portals.flatMap((p) => tilesOf(p.rect)), ...spawnTiles()],
      routeTiles: () => ({
        starts: Object.values(this.area.def.spawns).map((t): Tile => [t[0], t[1]]),
        targets: [
          ...this.portals.map((p): Tile => [Math.floor(p.rect.x / TILE), Math.floor((p.rect.y + p.rect.h - 1) / TILE)]),
          ...Object.values(this.area.def.spawns).map((t): Tile => [t[0], t[1]]),
          // 端を越えて隣のエリアへ出る道（壁の切れ目）もふさがない
          ...edgeOpenings(),
        ],
      }),
      spriteFrame: (sprite: string, anim: string, i: number) => this.spriteFrame(sprite, anim, i),
    };
  }

  private devState() {
    const b = this.body;
    return {
      area: this.area.def.id,
      tile: [Math.floor((b.x + b.w / 2) / TILE), Math.floor((b.y + b.h / 2) / TILE)],
      pos: [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10],
      vel: [Math.round(b.vx * 100) / 100, Math.round(b.vy * 100) / 100],
      grounded: b.grounded,
      sprite: this.player.texture.key,
      flipX: this.player.flipX,
      transitioning: this.transitioning,
      prompt: document.querySelector('.prompt')?.textContent ?? '',
      pickups: this.pickups.length,
      pickupTiles: this.pickups.map((p) => p.p.tile),
      pocket: this.save.data.pocket.filter(Boolean).map((s) => `${s!.item}:${s!.quality}x${s!.count}`),
    };
  }

  private saveDevPosition(): void {
    try {
      sessionStorage.setItem(DEV_STATE_KEY, JSON.stringify({ areaId: this.area.def.id, x: this.body.x, y: this.body.y }));
    } catch {
      // 保存できなくても遊ぶのに支障はない
    }
  }

  static readDevPosition(): { areaId: string; x: number; y: number } | null {
    try {
      const raw = sessionStorage.getItem(DEV_STATE_KEY);
      return raw ? (JSON.parse(raw) as { areaId: string; x: number; y: number }) : null;
    } catch {
      return null;
    }
  }
}
