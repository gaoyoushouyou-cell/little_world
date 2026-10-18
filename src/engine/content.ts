import type { z } from 'zod';
import { Area } from '../schema/area';
import { MapDef } from '../schema/map';
import { AreaTiles, Sprite, Tileset, type TileDef } from '../schema/assets';
import { Entities, ObjectDef, type Placement } from '../schema/objects';
import { BaseDef, Economy, ItemDef } from '../schema/economy';
import { RecipeDef } from '../schema/recipes';
import { interactionPlugins, layerPlugins } from '../registry';
import { analyzeImage, checkImage, decodeInBrowser, imagePath, type ImageDecoder, type LoadedImage } from './images';
import { layoutObject, type ObjectLayout } from './objects';
import { SolidMap, TileGrid } from './tilegrid';
import { WorldMap, type PlacedArea } from './world';

/**
 * content/ の読み込みと検証。
 * area.json などの小さいファイルは起動時にすべて読み、重い tiles.json だけを
 * エリアに入るとき（と隣のエリアの分）に遅延読み込みする。レイヤーが使う画像（PNG）も同じときに読む。
 */

export interface ContentOptions {
  /** PNG を RGBA にする方法（既定はブラウザの createImageBitmap。テストではファイルを読むものを渡す） */
  decodeImage?: ImageDecoder;
}

export interface ContentIssue {
  level: 'error' | 'warning';
  file: string;
  message: string;
}

export interface LoadedArea {
  def: Area;
  placed: PlacedArea;
  /** tiles レイヤーの id → 格子 */
  grids: Record<string, TileGrid>;
  solid: SolidMap;
  /** タイルだけの当たり判定（物を足す前。建築モードで物を置き直すときに使う） */
  tileSolid: SolidMap;
  /** layers[i] をプラグインのスキーマで検証した結果 */
  layerParams: unknown[];
  /** 置いた物（entities.json） */
  objects: PlacedObject[];
}

export interface PlacedObject {
  placement: Placement;
  def: ObjectDef;
  layout: ObjectLayout;
}

const mapFiles = import.meta.glob('/content/world/map.json', { eager: true, import: 'default' });
const areaFiles = import.meta.glob('/content/areas/*/area.json', { eager: true, import: 'default' });
const tilesFiles = import.meta.glob('/content/areas/*/tiles.json', { import: 'default' });
const tilesetFiles = import.meta.glob('/content/assets/tiles/*.json', { eager: true, import: 'default' });
const spriteFiles = import.meta.glob('/content/assets/sprites/*.json', { eager: true, import: 'default' });
const objectFiles = import.meta.glob('/content/objects/*.json', { eager: true, import: 'default' });
const entitiesFiles = import.meta.glob('/content/areas/*/entities.json', { import: 'default' });
const itemFiles = import.meta.glob('/content/items/*.json', { eager: true, import: 'default' });
const baseFiles = import.meta.glob('/content/bases/*.json', { eager: true, import: 'default' });
const economyFiles = import.meta.glob('/content/world/economy.json', { eager: true, import: 'default' });
const recipeFiles = import.meta.glob('/content/recipes/*.json', { eager: true, import: 'default' });
/** 画像は URL だけを持っておき、使うエリアに入るときに読む */
const imageFiles = import.meta.glob<string>('/content/assets/images/**/*.png', { query: '?url', import: 'default' });

const fileName = (path: string) => (path.split('/').pop() ?? path).replace(/\.json$/, '');
const folderName = (path: string) => path.split('/').at(-2) ?? path;
const describe = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.length ? i.path.join('.') : '(全体)'}: ${i.message}`);

export class Content {
  readonly issues: ContentIssue[] = [];
  readonly areas = new Map<string, Area>();
  readonly tiles = new Map<string, TileDef>();
  readonly sprites = new Map<string, Sprite>();
  readonly objects = new Map<string, ObjectDef>();
  readonly items = new Map<string, ItemDef>();
  /** エリア id → 拠点の設定 */
  readonly bases = new Map<string, BaseDef>();
  economy: Economy = { pocketSlots: 12, storageSlots: [24], baseCostGrowth: 1.5, starter: [] };
  map!: MapDef;
  world!: WorldMap;
  /** 加工のレシピ（読み込んだ順） */
  readonly recipes = new Map<string, RecipeDef>();
  /** 読み込み済みの画像（id → 画素）。エリアに入るときに増える */
  readonly images = new Map<string, LoadedImage>();

  private readonly layerParams = new Map<string, unknown[]>();
  private readonly pending = new Map<string, Promise<LoadedArea>>();
  private readonly loaded = new Map<string, LoadedArea>();
  /** エリア id → そのエリアのレイヤーが使う画像 */
  private readonly areaImages = new Map<string, string[]>();
  private readonly imagePending = new Map<string, Promise<LoadedImage>>();
  private readonly decodeImage: ImageDecoder;

  constructor(options: ContentOptions = {}) {
    this.decodeImage = options.decodeImage ?? decodeInBrowser;
    this.loadTilesets();
    this.loadSprites();
    this.loadObjects();
    this.loadAreas();
    this.loadMap();
    this.loadEconomy();
    this.checkFurniture();
    this.loadRecipes();
  }

  private loadRecipes() {
    for (const [path, raw] of Object.entries(recipeFiles)) {
      const r = RecipeDef.safeParse(raw);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(path, m));
        continue;
      }
      const rec = r.data;
      if (rec.id !== fileName(path)) this.error(path, `id "${rec.id}" がファイル名と違う`);
      if (!this.items.has(rec.output.item)) this.error(path, `できる物 "${rec.output.item}" が content/items/ にない`);
      for (const c of rec.inputs) if (!this.items.has(c.item)) this.error(path, `材料 "${c.item}" が content/items/ にない`);
      const out = this.items.get(rec.output.item);
      if (out && rec.output.count > out.maxStack) this.error(path, `できる数 ${rec.output.count} が 1 マスに入る数 ${out.maxStack} を超える`);
      this.recipes.set(rec.id, rec);
    }
  }

  /** 家具の持ち物と、しまえる物の対応を確かめる（決定 51・54） */
  private checkFurniture() {
    for (const s of this.economy.starter) if (!this.items.has(s.item)) this.error('/content/world/economy.json', `starter の持ち物 "${s.item}" が content/items/ にない`);
    for (const item of this.items.values()) {
      const file = `/content/items/${item.id}.json`;
      if (item.kind === 'furniture') {
        if (!item.places) this.error(file, '家具（kind: furniture）には places（置く物）が要る');
        else if (!this.objects.has(item.places)) this.error(file, `places の物 "${item.places}" が content/objects/ にない`);
        if (item.weight !== 0) this.error(file, '家具の重さは 0 にする');
        if (item.maxStack !== 1) this.error(file, '家具は 1 マスに 1 つ（maxStack: 1）');
      } else if (item.places) this.error(file, 'places は家具（kind: furniture）だけに書く');
    }
    for (const obj of this.objects.values()) {
      if (!obj.movable) continue;
      const item = this.items.get(obj.item ?? obj.id);
      const file = `/content/objects/${obj.id}.json`;
      if (!item) this.error(file, `しまえる物（movable）の家具の持ち物 "${obj.item ?? obj.id}" が content/items/ にない`);
      else if (item.kind !== 'furniture' || item.places !== obj.id) this.error(file, `持ち物 "${item.id}" が、この物を置く家具になっていない`);
    }
  }

  /** 物をしまったときに入る家具の持ち物（しまえない物なら undefined） */
  furnitureItemOf(objectId: string): string | undefined {
    const obj = this.objects.get(objectId);
    if (!obj) return undefined;
    const id = obj.item ?? obj.id;
    const item = this.items.get(id);
    return item?.kind === 'furniture' && item.places === objectId ? id : undefined;
  }

  /** エリアの中での物の置き方（当たり判定のマスと足元の位置） */
  layoutIn(def: Area, placement: Placement): ObjectLayout | undefined {
    const obj = this.objects.get(placement.object);
    if (!obj) return undefined;
    const gravity: [number, number] = def.view === 'top' ? [0, 0] : def.physics.gravity;
    return layoutObject(placement, obj, this.spriteSize(obj.sprite, obj.animation)?.w ?? 16, def.view, gravity);
  }

  private loadEconomy() {
    const path = '/content/world/economy.json';
    const raw = economyFiles[path];
    if (raw) {
      const r = Economy.safeParse(raw);
      if (r.success) this.economy = r.data;
      else describe(r.error).forEach((m) => this.error(path, m));
    }
    for (const [file, rawItem] of Object.entries(itemFiles)) {
      const r = ItemDef.safeParse(rawItem);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(file, m));
        continue;
      }
      if (r.data.id !== fileName(file)) this.error(file, `id "${r.data.id}" がファイル名と違う`);
      if (!this.sprites.has(r.data.icon)) this.error(file, `アイコンのスプライト "${r.data.icon}" がない`);
      this.items.set(r.data.id, r.data);
    }
    for (const [file, rawBase] of Object.entries(baseFiles)) {
      const r = BaseDef.safeParse(rawBase);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(file, m));
        continue;
      }
      const b = r.data;
      const area = this.areas.get(b.area);
      if (b.area !== fileName(file)) this.error(file, `area "${b.area}" がファイル名と違う`);
      if (!area) {
        this.error(file, `エリア "${b.area}" がない`);
        continue;
      }
      if (!area.basable) this.error(file, `${b.area} は basable でない`);
      if (area.resetOnEnter) this.error(file, `${b.area} は揺らぎ区域なので拠点にできない`);
      if (!(b.spawn in area.spawns)) this.error(file, `spawn "${b.spawn}" が ${b.area} にない`);
      if (!b.initial && !b.stages.some((s) => s.stage === 1)) this.error(file, '拠点にするとき（stage 1）の費用がない');
      for (const s of b.stages) for (const c of s.cost) if (!this.items.has(c.item)) this.error(file, `費用の素材 "${c.item}" がない`);
      this.bases.set(b.area, b);
    }
    for (const area of this.areas.values()) {
      const file = `/content/areas/${area.id}/area.json`;
      for (const g of area.gather?.items ?? []) if (!this.items.has(g.item)) this.error(file, `gather の素材 "${g.item}" がない`);
      if (area.gather && !area.resetOnEnter) this.warn(file, 'gather は揺らぎ区域（resetOnEnter: true）でだけ使われる');
    }
  }

  get hasErrors(): boolean {
    return this.issues.some((i) => i.level === 'error');
  }

  private error(file: string, message: string) {
    this.issues.push({ level: 'error', file, message });
  }

  private warn(file: string, message: string) {
    this.issues.push({ level: 'warning', file, message });
  }

  private loadTilesets() {
    for (const [path, raw] of Object.entries(tilesetFiles)) {
      const r = Tileset.safeParse(raw);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(path, m));
        continue;
      }
      for (const [id, def] of Object.entries(r.data.tiles)) {
        if (this.tiles.has(id)) this.error(path, `タイル ID "${id}" が別のタイルセットと重複`);
        if (def.art && (def.art.pixels.length !== 16 || def.art.pixels[0]!.length !== 16)) {
          this.error(path, `タイル "${id}" のドット絵は 16×16 にする`);
        }
        this.tiles.set(id, def);
      }
    }
  }

  private loadSprites() {
    for (const [path, raw] of Object.entries(spriteFiles)) {
      const r = Sprite.safeParse(raw);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(path, m));
        continue;
      }
      const sprite = r.data;
      let size: string | null = null;
      for (const [anim, frames] of Object.entries(sprite.animations)) {
        frames.forEach((rows, i) => {
          const w = rows[0]!.length;
          if (rows.some((row) => row.length !== w)) this.error(path, `${anim}[${i}] の行の幅がそろっていない`);
          const s = `${w}x${rows.length}`;
          size ??= s;
          if (s !== size) this.error(path, `${anim}[${i}] の大きさ ${s} が他のコマ ${size} と違う`);
          for (const row of rows) {
            for (const ch of row) {
              if (!(ch in sprite.palette)) {
                this.error(path, `${anim}[${i}] の文字 "${ch}" がパレットにない`);
                return;
              }
            }
          }
        });
      }
      this.sprites.set(fileName(path), sprite);
    }
  }

  /** スプライトの1コマ目の大きさ */
  spriteSize(id: string, anim = 'idle'): { w: number; h: number } | undefined {
    const s = this.sprites.get(id);
    const rows = (s?.animations[anim] ?? s?.animations['idle'])?.[0];
    return rows ? { w: rows[0]!.length, h: rows.length } : undefined;
  }

  private loadObjects() {
    for (const [path, raw] of Object.entries(objectFiles)) {
      const r = ObjectDef.safeParse(raw);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(path, m));
        continue;
      }
      const def = r.data;
      if (def.id !== fileName(path)) this.error(path, `id "${def.id}" がファイル名と違う`);
      const sprite = this.sprites.get(def.sprite);
      if (!sprite) this.error(path, `スプライト "${def.sprite}" がない`);
      else if (!sprite.animations[def.animation]) this.error(path, `スプライト "${def.sprite}" にアニメーション "${def.animation}" がない`);
      if (def.interact) {
        const plugin = interactionPlugins.get(def.interact.type);
        if (!plugin) this.error(path, `未登録の interact "${def.interact.type}"（登録済み: ${interactionPlugins.types().join(', ')}）`);
        else {
          const p = plugin.params.safeParse(def.interact);
          if (!p.success) describe(p.error).forEach((m) => this.error(path, `interact ${m}`));
        }
      }
      this.objects.set(def.id, def);
    }
  }

  private loadAreas() {
    for (const [path, raw] of Object.entries(areaFiles)) {
      const r = Area.safeParse(raw);
      if (!r.success) {
        describe(r.error).forEach((m) => this.error(path, m));
        continue;
      }
      const area = r.data;
      if (area.id !== folderName(path)) {
        this.error(path, `id "${area.id}" がフォルダ名 "${folderName(path)}" と違う`);
        continue;
      }
      const params: unknown[] = [];
      const images: string[] = [];
      area.layers.forEach((layer, i) => {
        const plugin = layerPlugins.get(layer.type);
        if (!plugin) {
          this.error(path, `layers[${i}]: 未登録のレイヤー "${layer.type}"（登録済み: ${layerPlugins.types().join(', ')}）`);
          params.push(undefined);
          return;
        }
        const { type: _type, ...rest } = layer;
        const p = plugin.params.safeParse(rest);
        if (!p.success) describe(p.error).forEach((m) => this.error(path, `layers[${i}] (${layer.type}) ${m}`));
        params.push(p.success ? p.data : undefined);
        if (p.success && plugin.images) {
          for (const id of plugin.images(p.data)) {
            if (!imageFiles[imagePath(id)]) this.error(path, `layers[${i}] (${layer.type}) 画像 "${id}" が content/assets/images/ にない`);
            else if (!images.includes(id)) images.push(id);
          }
        }
      });
      this.areaImages.set(area.id, images);
      const [w, h] = area.size;
      const inBounds = ([x, y]: [number, number]) => x >= 0 && y >= 0 && x < w && y < h;
      for (const [name, at] of Object.entries(area.spawns)) {
        if (!inBounds(at)) this.error(path, `spawns.${name} がエリアの外`);
      }
      for (const exit of area.exits) {
        if (!inBounds(exit.at)) this.error(path, `exits.${exit.id} がエリアの外`);
      }
      this.layerParams.set(area.id, params);
      this.areas.set(area.id, area);
    }
  }

  private loadMap() {
    const path = '/content/world/map.json';
    const raw = mapFiles[path];
    if (!raw) {
      this.error(path, 'map.json がない');
      this.world = new WorldMap([]);
      return;
    }
    const r = MapDef.safeParse(raw);
    if (!r.success) {
      describe(r.error).forEach((m) => this.error(path, m));
      this.world = new WorldMap([]);
      return;
    }
    this.map = r.data;

    const placed: PlacedArea[] = [];
    const seen = new Set<string>();
    for (const { id, pos } of this.map.areas) {
      if (seen.has(id)) this.error(path, `エリア "${id}" が2回配置されている`);
      seen.add(id);
      const def = this.areas.get(id);
      if (!def) {
        this.error(path, `配置されたエリア "${id}" の area.json がない`);
        continue;
      }
      placed.push({ id, x: pos[0], y: pos[1], w: def.size[0], h: def.size[1] });
    }
    for (const id of this.areas.keys()) {
      if (!seen.has(id)) this.warn(`/content/areas/${id}/area.json`, '地図（map.json）に配置されていない');
    }
    this.world = new WorldMap(placed);

    if (!this.sprites.has(this.map.player.sprite)) this.error(path, `player.sprite "${this.map.player.sprite}" のスプライトがない`);

    const { start } = this.map;
    const startArea = this.areas.get(start.area);
    if (!startArea) this.error(path, `start.area "${start.area}" がない`);
    else if (!(start.spawn in startArea.spawns)) this.error(path, `start.spawn "${start.spawn}" が ${start.area} にない`);

    const inArea = (area: string, [x, y]: [number, number]) => {
      const def = this.areas.get(area);
      return !!def && x >= 0 && y >= 0 && x < def.size[0] && y < def.size[1];
    };
    for (const warp of this.map.warps) {
      for (const end of [warp.from, warp.to]) {
        if (!this.areas.has(end.area)) this.error(path, `warps.${warp.id}: エリア "${end.area}" がない`);
        else if (!inArea(end.area, end.at)) this.error(path, `warps.${warp.id}: ${end.area} の [${end.at}] はエリアの外`);
      }
    }
    for (const area of this.areas.values()) {
      for (const exit of area.exits) {
        const target = this.areas.get(exit.to);
        const file = `/content/areas/${area.id}/area.json`;
        if (!target) this.error(file, `exits.${exit.id}: 行き先 "${exit.to}" がない`);
        else if (!(exit.spawn in target.spawns)) this.error(file, `exits.${exit.id}: ${exit.to} に spawn "${exit.spawn}" がない`);
      }
    }
  }

  getLoaded(id: string): LoadedArea | undefined {
    return this.loaded.get(id);
  }

  loadArea(id: string): Promise<LoadedArea> {
    let p = this.pending.get(id);
    if (!p) {
      p = this.doLoadArea(id);
      this.pending.set(id, p);
      p.catch(() => this.pending.delete(id));
    }
    return p;
  }

  /** エリアと、端で隣り合うエリアのタイルを読み込む */
  async loadWithNeighbors(id: string): Promise<LoadedArea> {
    const area = await this.loadArea(id);
    await Promise.all(this.world.neighbors(id).map((n) => this.loadArea(n.id).catch(() => undefined)));
    return area;
  }

  private async doLoadArea(id: string): Promise<LoadedArea> {
    const def = this.areas.get(id);
    const placed = this.world.get(id);
    if (!def || !placed) throw new Error(`エリア "${id}" がない、または地図に配置されていない`);
    const file = `/content/areas/${id}/tiles.json`;
    const [w, h] = def.size;
    const params = this.layerParams.get(id) ?? [];

    const tileLayers = def.layers
      .map((layer, i) => ({ layer, params: params[i] as { id: string; collide: boolean } | undefined }))
      .filter((l) => l.layer.type === 'tiles' && l.params);

    const grids: Record<string, TileGrid> = {};
    const solid = new SolidMap(w, h);
    const problems: string[] = [];

    if (tileLayers.length > 0) {
      const loader = tilesFiles[file];
      if (!loader) throw this.fail(file, 'tiles.json がない');
      const r = AreaTiles.safeParse(await loader());
      if (!r.success) throw this.fail(file, describe(r.error).join(' / '));
      const tiles = r.data;
      for (const [ch, tileId] of Object.entries(tiles.legend)) {
        if (tileId && !this.tiles.has(tileId)) problems.push(`凡例 "${ch}" のタイル "${tileId}" が定義されていない`);
      }
      for (const { params: lp } of tileLayers) {
        const rows = tiles.layers[lp!.id];
        if (!rows) {
          problems.push(`レイヤー "${lp!.id}" がない`);
          continue;
        }
        if (rows.length !== h) problems.push(`レイヤー "${lp!.id}" の行数 ${rows.length} がエリアの高さ ${h} と違う`);
        rows.forEach((row, y) => {
          if (row.length !== w) problems.push(`レイヤー "${lp!.id}" の ${y} 行目の幅 ${row.length} がエリアの幅 ${w} と違う`);
          const bad = [...row].find((ch) => !(ch in tiles.legend));
          if (bad !== undefined) problems.push(`レイヤー "${lp!.id}" の ${y} 行目の文字 "${bad}" が凡例にない`);
        });
        const grid = TileGrid.fromRows(rows, tiles.legend);
        grids[lp!.id] = grid;
        if (lp!.collide) {
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const t = grid.get(x, y);
              if (t && this.tiles.get(t)?.solid) solid.set(x, y, true);
            }
          }
        }
      }
    }
    if (problems.length) throw this.fail(file, problems.join(' / '));

    await Promise.all((this.areaImages.get(id) ?? []).map((img) => this.loadImage(img)));
    def.layers.forEach((layer, i) => {
      const plugin = layerPlugins.get(layer.type);
      if (!plugin?.check || params[i] === undefined) return;
      for (const m of plugin.check(params[i], this.images)) this.error(`/content/areas/${id}/area.json`, `layers[${i}] (${layer.type}) ${m}`);
    });

    const tileSolid = new SolidMap(w, h);
    tileSolid.data.set(solid.data);
    const objects = await this.loadEntities(def, solid);
    const loaded: LoadedArea = { def, placed, grids, solid, tileSolid, layerParams: params, objects };
    this.loaded.set(id, loaded);
    return loaded;
  }

  /** 画像を読み、検証して images に入れる（同じ画像は一度だけ読む） */
  loadImage(id: string): Promise<LoadedImage> {
    let p = this.imagePending.get(id);
    if (!p) {
      p = this.doLoadImage(id);
      this.imagePending.set(id, p);
      p.catch(() => this.imagePending.delete(id));
    }
    return p;
  }

  private async doLoadImage(id: string): Promise<LoadedImage> {
    const path = imagePath(id);
    const url = imageFiles[path];
    if (!url) throw this.fail(path, '画像がない');
    const pixels = await this.decodeImage(await url());
    for (const m of checkImage(pixels)) this.error(path, m);
    const image: LoadedImage = { ...pixels, id, palette: analyzeImage(pixels).palette };
    this.images.set(id, image);
    return image;
  }

  /** 置いた物を読み、当たり判定のマスを solid に足す */
  private async loadEntities(def: Area, solid: SolidMap): Promise<PlacedObject[]> {
    const file = `/content/areas/${def.id}/entities.json`;
    const loader = entitiesFiles[file];
    if (!loader) return [];
    const r = Entities.safeParse(await loader());
    if (!r.success) throw this.fail(file, describe(r.error).join(' / '));
    const [w, h] = def.size;
    const gravity: [number, number] = def.view === 'top' ? [0, 0] : def.physics.gravity;
    const problems: string[] = [];
    const objects: PlacedObject[] = [];
    r.data.forEach((placement, i) => {
      const obj = this.objects.get(placement.object);
      if (!obj) {
        problems.push(`[${i}] 物 "${placement.object}" が content/objects/ にない`);
        return;
      }
      const [x, y] = placement.at;
      if (x < 0 || y < 0 || x >= w || y >= h) problems.push(`[${i}] ${placement.object} の at [${x}, ${y}] がエリアの外`);
      const size = this.spriteSize(obj.sprite, obj.animation);
      const layout = layoutObject(placement, obj, size?.w ?? 16, def.view, gravity);
      for (const [cx, cy] of layout.cells) {
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) problems.push(`[${i}] ${placement.object} の当たり判定がエリアからはみ出す`);
        else solid.set(cx, cy, true);
      }
      objects.push({ placement, def: obj, layout });
    });
    if (problems.length) throw this.fail(file, [...new Set(problems)].join(' / '));
    return objects;
  }

  private fail(file: string, message: string): Error {
    this.error(file, message);
    return new Error(`${file}: ${message}`);
  }
}
