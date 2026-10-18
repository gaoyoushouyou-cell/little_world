/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { Content, type LoadedArea } from '../src/engine/content';
import { SolidMap } from '../src/engine/tilegrid';
import { WorldMap } from '../src/engine/world';
import { Area } from '../src/schema/area';
import { MapDef } from '../src/schema/map';
import { buildAtlas } from '../tools/atlas/build';
import { Atlas } from '../tools/atlas/schema';
import type { AtlasSource } from '../tools/atlas/source';
import { decodePngFile } from '../tools/lib/png-file';

/**
 * 開発の地図帳の解析（tools/atlas/、docs/design/14_dev_atlas.md 13.9）。
 */

describe('今の content', () => {
  let content: Content;
  beforeAll(async () => {
    content = new Content({ decodeImage: decodePngFile });
    for (const p of content.world.all()) await content.loadArea(p.id);
  });

  it('赤がなく、全部のエリアと行き来できる', () => {
    const atlas = Atlas.parse(buildAtlas(content));
    expect(atlas.findings.filter((f) => f.severity === 'red')).toEqual([]);
    const reach = Object.fromEntries(atlas.nodes.filter((n) => n.kind === 'area').map((n) => [n.id, n.reach]));
    expect(reach).toEqual({
      'area:bed_room': 'start',
      'area:sunken_promenade': 'ok',
      'area:inverted_aquarium': 'ok',
      'area:endless_field': 'ok',
    });
  });

  it('重力の違う遊歩道と水族館の境界を、両方の向きに歩いて越えられる', () => {
    const atlas = buildAtlas(content);
    const op = atlas.openings.find((o) => o.id === 'adj:inverted_aquarium|sunken_promenade#0');
    expect(op?.pass).toEqual({ 'a>b': 'walk', 'b>a': 'walk' });
  });

  it('関節点はベッドの部屋、橋は野原へのワープ', () => {
    const { stats } = buildAtlas(content);
    expect(stats.articulation).toEqual(['area:bed_room']);
    expect(stats.bridges).toEqual(['warp:bed_to_field']);
  });
});

// ---- 架空の世界 ---------------------------------------------------------

interface FakeArea {
  id: string;
  pos: [number, number];
  /** # が壁 */
  rows: string[];
  view?: 'top' | 'side';
  depth?: number;
  wrap?: 'none' | 'horizontal' | 'vertical' | 'both';
  spawns?: Record<string, [number, number]>;
}

function fakeWorld(areas: FakeArea[], warps: { id: string; from: [string, number, number]; to: [string, number, number]; bidirectional?: boolean }[] = []): AtlasSource {
  const defs = new Map(
    areas.map((a) => [
      a.id,
      Area.parse({
        id: a.id,
        name: a.id,
        view: a.view ?? 'top',
        size: [a.rows[0]!.length, a.rows.length],
        depth: a.depth ?? 1,
        physics: { wrap: a.wrap ?? 'none' },
        layers: [{ type: 'tiles', id: 'ground', collide: true }],
        spawns: a.spawns ?? { s: [1, 1] },
      }),
    ]),
  );
  const placed = areas.map((a) => ({ id: a.id, x: a.pos[0], y: a.pos[1], w: a.rows[0]!.length, h: a.rows.length }));
  const loaded = new Map(
    areas.map((a, i) => {
      const solid = SolidMap.fromAscii(a.rows);
      return [a.id, { def: defs.get(a.id)!, placed: placed[i]!, solid, tileSolid: solid, grids: {}, layerParams: [], objects: [] } as LoadedArea];
    }),
  );
  return {
    map: MapDef.parse({
      version: 1,
      start: { area: areas[0]!.id, spawn: 's' },
      areas: areas.map((a) => ({ id: a.id, pos: a.pos })),
      warps: warps.map((w) => ({
        id: w.id,
        from: { area: w.from[0], at: [w.from[1], w.from[2]] },
        to: { area: w.to[0], at: [w.to[1], w.to[2]] },
        bidirectional: w.bidirectional ?? false,
      })),
    }),
    areas: defs,
    world: new WorldMap(placed),
    bases: new Map(),
    issues: [],
    getLoaded: (id: string) => loaded.get(id),
  };
}

/** 6×4 の見下ろしの部屋。open に書いた辺だけ壁がない */
function room(open: ('n' | 's' | 'e' | 'w')[] = []): string[] {
  return [0, 1, 2, 3].map((y) =>
    [0, 1, 2, 3, 4, 5]
      .map((x) => {
        const edge = (y === 0 && !open.includes('n')) || (y === 3 && !open.includes('s')) || (x === 0 && !open.includes('w')) || (x === 5 && !open.includes('e'));
        return edge ? '#' : '.';
      })
      .join(''),
  );
}

const reachOf = (atlas: ReturnType<typeof buildAtlas>) =>
  Object.fromEntries(atlas.nodes.filter((n) => n.kind === 'area').map((n) => [n.id.slice(5), n.reach]));
const checksOf = (atlas: ReturnType<typeof buildAtlas>) => atlas.findings.map((f) => `${f.check}:${f.severity}`).sort();

describe('架空の世界', () => {
  it('孤立・行けない・目覚めで戻る・失って戻る を見分ける', () => {
    const atlas = buildAtlas(
      fakeWorld(
        [
          { id: 'start', pos: [0, 0], rows: room(['e']) },
          { id: 'east', pos: [6, 0], rows: room(['w']) },
          { id: 'alone', pos: [50, 0], rows: room() },
          { id: 'shallow', pos: [60, 0], rows: room(), depth: 2 },
          { id: 'deep', pos: [70, 0], rows: room(), depth: 5 },
          { id: 'source', pos: [80, 0], rows: room() },
        ],
        [
          { id: 'to_shallow', from: ['start', 2, 2], to: ['shallow', 2, 2] },
          { id: 'to_deep', from: ['start', 3, 2], to: ['deep', 2, 2] },
          { id: 'from_source', from: ['source', 2, 2], to: ['start', 2, 1] },
        ],
      ),
    );
    expect(reachOf(atlas)).toEqual({ start: 'start', east: 'ok', alone: 'isolated', shallow: 'wake', deep: 'lose', source: 'unreachable' });
    expect(checksOf(atlas)).toEqual([
      'isolated:red',
      'no_walk_back:info',
      'no_walk_back:yellow',
      'one_way_link:info',
      'one_way_link:info',
      'one_way_link:info',
      'unreachable:red',
    ]);
    expect(atlas.openings).toHaveLength(1);
  });

  it('閉じた境界と、ループする端に接した境界', () => {
    const atlas = buildAtlas(
      fakeWorld([
        { id: 'start', pos: [0, 0], rows: room(['s']) },
        { id: 'walled', pos: [6, 0], rows: room() },
        { id: 'loop', pos: [0, 4], rows: room(['n', 'e', 'w']), wrap: 'vertical' },
      ]),
    );
    expect(checksOf(atlas)).toEqual(expect.arrayContaining(['closed_border:info', 'wrap_border:yellow']));
    expect(atlas.openings).toEqual([]);
  });

  it('横視点で縦に重なったエリアは、落ちられるが登れない（片方の向きの口）', () => {
    const upper = ['#....#', '#....#', '#....#', '##..##'];
    const lower = ['#....#', ...Array.from({ length: 9 }, () => '#....#'), '######'];
    const atlas = buildAtlas(
      fakeWorld([
        { id: 'upper', pos: [0, 0], rows: ['######', ...upper], view: 'side', spawns: { s: [1, 3] } },
        { id: 'lower', pos: [0, 5], rows: lower, view: 'side', spawns: { s: [2, 9] } },
      ]),
    );
    // a = lower、b = upper（ID の順）
    expect(atlas.openings.map((o) => o.pass)).toEqual([{ 'a>b': 'fail', 'b>a': 'walk' }]);
    expect(reachOf(atlas)).toEqual({ upper: 'start', lower: 'wake' });
    expect(checksOf(atlas)).toEqual(['no_walk_back:info', 'one_way_opening:info']);
  });

  it('横視点の 1 マスの口と、足場のない出現位置', () => {
    // 部屋の高さは 2 マスあるが、境界で空いているのは上の 1 マスだけ
    const left = ['######', '#.....', '#....#', '######'];
    const right = ['######', '.....#', '#....#', '######'];
    const air = Array.from({ length: 24 }, () => '......');
    const atlas = buildAtlas(
      fakeWorld([
        { id: 'left', pos: [0, 0], rows: left, view: 'side', spawns: { s: [2, 2] } },
        { id: 'right', pos: [6, 0], rows: right, view: 'side', spawns: { s: [2, 2] } },
        { id: 'sky', pos: [40, 0], rows: air, view: 'side', spawns: { s: [2, 1] } },
      ]),
    );
    expect(checksOf(atlas)).toEqual(expect.arrayContaining(['narrow_opening:info', 'failed_opening:info', 'unsafe_landing:red']));
    expect(atlas.findings.filter((f) => f.check === 'unsafe_landing').map((f) => f.nodes)).toEqual([['area:sky']]);
  });
});

describe('公開版に入らない（決定 74）', () => {
  it('src/ から planning/ と tools/ を読み込んでいない', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|js)$/.test(f)) files.push(p);
      }
    };
    walk(srcDir);
    const bad = files.filter((f) => /(from\s+|import\(|glob\(\s*)['"][^'"]*\/(planning|tools)\//.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
