import { createPinsStore } from './pins';
import { pinnedToolPreferencesStore } from '../features/toolbox/pinned-tool-preferences';

export const useToolboxPins = createPinsStore(pinnedToolPreferencesStore);
