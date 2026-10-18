import Phaser from 'phaser';
import { Content } from './engine/content';
import { VIEW_H, VIEW_W } from './engine/constants';
import { AreaScene, type AreaSceneData } from './scenes/AreaScene';
import { SaveStore } from './systems/save';
import { showIssues } from './ui/overlay';
import { createUi } from './ui/ui';

/** 画面に収まる最大の整数倍 */
function fitZoom(): number {
  return Math.max(1, Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)));
}

function applyZoom(zoom: number, game?: Phaser.Game): void {
  const stage = document.getElementById('stage')!;
  stage.style.width = `${VIEW_W * zoom}px`;
  stage.style.height = `${VIEW_H * zoom}px`;
  stage.style.setProperty('--z', String(zoom));
  game?.scale.setZoom(zoom);
}

/**
 * 開始位置を決める。
 * 開発中は ?area=<id>（&spawn=<名前>）で好きなエリアから始められ、
 * ファイルを保存して再読み込みされたときは直前の位置に戻る。
 */
function resolveStart(content: Content, save: SaveStore): AreaSceneData {
  const params = new URLSearchParams(location.search);
  const areaParam = params.get('area');
  if (areaParam && content.areas.has(areaParam)) {
    const area = content.areas.get(areaParam)!;
    const spawnName = params.get('spawn') ?? Object.keys(area.spawns)[0];
    const tile = (spawnName && area.spawns[spawnName]) || [Math.floor(area.size[0] / 2), Math.floor(area.size[1] / 2)];
    return { areaId: areaParam, arrival: { kind: 'tile', tile } };
  }
  if (import.meta.env.DEV) {
    const saved = AreaScene.readDevPosition();
    if (saved && content.areas.has(saved.areaId) && content.world.get(saved.areaId)) {
      return { areaId: saved.areaId, arrival: { kind: 'restore', at: { x: saved.x, y: saved.y } } };
    }
  }
  // 最後に眠った場所から始める
  const r = save.data.respawn;
  const tile = r && content.world.get(r.area) ? ('tile' in r ? r.tile : content.areas.get(r.area)?.spawns[r.spawn]) : undefined;
  if (r && tile) return { areaId: r.area, arrival: { kind: 'tile', tile } };
  const { start } = content.map;
  return { areaId: start.area, arrival: { kind: 'tile', tile: content.areas.get(start.area)!.spawns[start.spawn]! } };
}

async function boot(): Promise<void> {
  applyZoom(fitZoom());
  const content = new Content();
  showIssues(content.issues, false);
  if (!content.map || !content.areas.has(content.map.start.area)) {
    showIssues(content.issues, true);
    return;
  }

  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  const save = new SaveStore(storage, content.economy.pocketSlots);
  const start = resolveStart(content, save);
  try {
    await content.loadWithNeighbors(start.areaId);
  } catch (e) {
    console.error(e);
    showIssues(content.issues, true);
    return;
  }
  showIssues(content.issues, content.hasErrors);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#000000',
    pixelArt: true,
    roundPixels: true,
    banner: false,
    scale: { mode: Phaser.Scale.NONE, zoom: fitZoom() },
  });
  game.registry.set('content', content);
  game.registry.set('save', save);
  game.registry.set('ui', createUi(content));
  game.registry.set('debug', new URLSearchParams(location.search).has('debug'));
  game.scene.add('area', AreaScene, true, start);

  window.addEventListener('resize', () => applyZoom(fitZoom(), game));
}

void boot();
