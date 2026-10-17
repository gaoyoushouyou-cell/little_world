import Phaser from 'phaser';
import type { Content, LoadedArea } from '../engine/content';
import { STEP_MS, TILE, VIEW_H, VIEW_W } from '../engine/constants';
import { dirFromVelocity, resolveAnimation, type Dir } from '../engine/facing';
import { Controls, type FrameInput } from '../engine/input';
import { gravityFrame, stepBody, type Body, type SolidQuery, type StepParams } from '../engine/physics';
import { gridToCanvas } from '../engine/pixelart';
import { checkEdge, placeArrival, stepParamsFor, type Arrival } from '../engine/travel';
import { makeSolidQuery, wrapsX, wrapsY } from '../engine/world';
import { layerPlugins } from '../registry';
import type { LayerInstance } from '../plugins/layers/_types';
import type { Trigger } from '../schema/area';
import { setDebug, setPrompt, showAreaTitle } from '../ui/overlay';

export interface AreaSceneData {
  areaId: string;
  arrival: Arrival;
}

interface Portal {
  kind: 'exit' | 'warp';
  rect: { x: number; y: number; w: number; h: number };
  trigger: Trigger;
  to: { areaId: string; tile: [number, number] };
}

const DEV_STATE_KEY = 'little-world:dev-position';

export class AreaScene extends Phaser.Scene {
  private content!: Content;
  private area!: LoadedArea;
  private sceneData!: AreaSceneData;
  private controls!: Controls;
  private body!: Body;
  private solid!: SolidQuery;
  private params!: StepParams;
  private layers: LayerInstance[] = [];
  private portals: Portal[] = [];
  private portalGfx!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Image;
  private tracked: string[] = [];
  private objectImages: { image: Phaser.GameObjects.Image; sprite: string; animation: string }[] = [];
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

  constructor() {
    super('area');
  }

  init(data: AreaSceneData): void {
    this.sceneData = data;
    this.layers = [];
    this.portals = [];
    this.tracked = [];
    this.objectImages = [];
    this.acc = 0;
    this.worldTime = 0;
    this.transitioning = false;
    this.touchArmed = false;
  }

  create(): void {
    this.content = this.registry.get('content') as Content;
    this.debug = this.registry.get('debug') === true;
    const area = this.content.getLoaded(this.sceneData.areaId);
    if (!area) throw new Error(`エリア ${this.sceneData.areaId} が読み込まれていない`);
    this.area = area;
    const def = area.def;

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
          { scene: this, area, tiles: this.content.tiles, depth: i * 10, track: (key) => this.tracked.push(key) },
          params,
        ),
      );
    });

    this.params = stepParamsFor(def);
    this.solid = makeSolidQuery({ id: def.id, solid: area.solid, wrap: def.physics.wrap }, this.content.world, (id) => this.content.getLoaded(id)?.solid);

    this.body = placeArrival(this.sceneData.arrival, this.params, this.solid);
    this.buildPortals();
    this.playerDepth = playerDepth;
    // 出入口は床の上（物やプレイヤーより奥）
    this.portalGfx = this.add.graphics().setDepth(playerDepth - 5);
    this.player = this.add.image(0, 0, this.playerFrame('idle', 0)).setOrigin(0.5, 1).setDepth(playerDepth);
    this.buildObjects();

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
    for (const obj of this.area.objects) {
      const { layout, placement } = obj;
      for (const ox of copiesX) {
        for (const oy of copiesY) {
          const image = this.add
            .image(layout.anchorX + ox, layout.anchorY + oy, this.spriteFrame(obj.def.sprite, obj.def.animation, 0))
            .setOrigin(0.5, 1)
            .setAngle(layout.angle)
            .setFlipX(placement.flipX)
            .setDepth(this.depthFor(layout.anchorY + oy, placement.front));
          this.objectImages.push({ image, sprite: obj.def.sprite, animation: obj.def.animation });
        }
      }
    }
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
        this.portals.push({ kind: 'warp', rect: this.portalRect(warp.from.at, undefined), trigger: warp.trigger, to: { areaId: warp.to.area, tile: warp.to.at } });
      }
      if (warp.bidirectional && warp.to.area === id) {
        this.portals.push({ kind: 'warp', rect: this.portalRect(warp.to.at, undefined), trigger: warp.trigger, to: { areaId: warp.from.area, tile: warp.from.at } });
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

  private goTo(data: AreaSceneData, fadeMs: number): void {
    if (this.transitioning) return;
    this.transitioning = true;
    setPrompt(null);
    const fade = new Promise<void>((resolve) => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
      this.cameras.main.fadeOut(fadeMs, 0, 0, 0);
    });
    Promise.all([fade, this.content.loadWithNeighbors(data.areaId)])
      .then(() => this.scene.restart(data))
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
    if (this.transitioning) return;

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
    if (portal?.trigger === 'interact') {
      setPrompt('E', portal.kind === 'warp' ? 'ふれる' : '入る');
      if (input.interactPressed) this.goTo({ areaId: portal.to.areaId, arrival: { kind: 'tile', tile: portal.to.tile } }, 400);
    } else {
      setPrompt(null);
      if (portal?.trigger === 'touch' && this.touchArmed) {
        this.goTo({ areaId: portal.to.areaId, arrival: { kind: 'tile', tile: portal.to.tile } }, 400);
      }
    }

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
   */
  private installDevHook(): void {
    const idle: FrameInput = { x: 0, y: 0, jumpHeld: false, jumpPressed: false, interactPressed: false, debugPressed: false };
    (window as unknown as { __lw: unknown }).__lw = {
      run: (input: Partial<FrameInput>, steps: number) => {
        if (!this.transitioning) this.advance({ ...idle, ...input }, steps);
        return this.devState();
      },
      state: () => this.devState(),
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
