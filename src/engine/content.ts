import type { z } from 'zod';
import { Area } from '../schema/area';
import { MapDef } from '../schema/map';
import { AreaTiles, Sprite, Tileset, type TileDef } from '../schema/assets';
import { Entities, ObjectDef, type Placement } from '../schema/objects';
import { layerPlugins } from '../registry';
import { layoutObject, type ObjectLayout } from './objects';
import { SolidMap, TileGrid } from './tilegrid';
import { WorldMap, type PlacedArea } from './world';

/**
 * content/ の読み込みと検証。
 * area.json などの小さいファイルは起動時にすべて読み、重い tiles.json だけを
 * エリアに入るとき（と隣のエリアの分）に遅延読み込みする。
 */

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
  map!: MapDef;
  world!: WorldMap;

  private readonly layerParams = new Map<string, unknown[]>();
  private readonly pending = new Map<string, Promise<LoadedArea>>();
  private readonly loaded = new Map<string, LoadedArea>();

  constructor() {
    this.loadTilesets();
    this.loadSprites();
    this.loadObjects();
    this.loadAreas();
    this.loadMap();
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
      });
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

    const objects = await this.loadEntities(def, solid);
    const loaded: LoadedArea = { def, placed, grids, solid, layerParams: params, objects };
    this.loaded.set(id, loaded);
    return loaded;
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
