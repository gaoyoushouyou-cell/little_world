import { Registry } from './registry';
import type { LayerPlugin } from '../plugins/layers/_types';
import type { InteractionPlugin } from '../plugins/interactions/_types';

/** レイヤーの種類（src/plugins/layers/*.ts） */
export const layerPlugins = new Registry<LayerPlugin>(
  'layers',
  import.meta.glob<{ default: LayerPlugin }>('../plugins/layers/*.ts', { eager: true }),
);

/** 物を調べたときに起きること（src/plugins/interactions/*.ts） */
export const interactionPlugins = new Registry<InteractionPlugin>(
  'interactions',
  import.meta.glob<{ default: InteractionPlugin }>('../plugins/interactions/*.ts', { eager: true }),
);
