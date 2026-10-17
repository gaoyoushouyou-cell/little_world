import { Registry } from './registry';
import type { LayerPlugin } from '../plugins/layers/_types';

/** レイヤーの種類（src/plugins/layers/*.ts） */
export const layerPlugins = new Registry<LayerPlugin>(
  'layers',
  import.meta.glob<{ default: LayerPlugin }>('../plugins/layers/*.ts', { eager: true }),
);
