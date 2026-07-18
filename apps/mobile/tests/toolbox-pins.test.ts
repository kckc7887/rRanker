import {
  emptyHomePinPreferences,
  type HomePinPreferences,
} from '@/features/toolbox/pinned-tool-preferences';
import { createToolboxPinsStore } from '@/state/toolbox-pins';

class MemoryPreferences {
  value: HomePinPreferences = emptyHomePinPreferences();
  failSave = false;

  async load(): Promise<HomePinPreferences> {
    return structuredClone(this.value);
  }

  async save(value: HomePinPreferences): Promise<void> {
    if (this.failSave) throw new Error('database unavailable');
    this.value = structuredClone(value);
  }
}

describe('toolbox pin state', () => {
  it('hydrates, pins and unpins a tool in shared state', async () => {
    const preferences = new MemoryPreferences();
    const store = createToolboxPinsStore(preferences);
    await store.getState().togglePinnedTool('maimai', 'rating');
    expect(store.getState().pinnedToolIdsByGame.maimai).toEqual(['rating']);
    expect(preferences.value.pinnedToolIdsByGame.maimai).toEqual(['rating']);

    await store.getState().togglePinnedTool('maimai', 'rating');
    expect(store.getState().pinnedToolIdsByGame.maimai).toEqual([]);
    expect(preferences.value.pinnedToolIdsByGame.maimai).toEqual([]);
  });

  it('hydrates, adds and removes multiple plate cards independently from tools', async () => {
    const preferences = new MemoryPreferences();
    const store = createToolboxPinsStore(preferences);
    await store.getState().togglePinnedTool('maimai', 'rating');
    await store.getState().togglePinnedPlate('maimai', 6101);
    await store.getState().togglePinnedPlate('maimai', 6102);
    expect(store.getState().pinnedToolIdsByGame.maimai).toEqual(['rating']);
    expect(store.getState().pinnedPlateIdsByGame.maimai).toEqual([6101, 6102]);

    await store.getState().togglePinnedPlate('maimai', 6101);
    expect(store.getState().pinnedPlateIdsByGame.maimai).toEqual([6102]);
    expect(preferences.value.pinnedPlateIdsByGame.maimai).toEqual([6102]);
  });

  it('rolls back the visible state when persistence fails', async () => {
    const preferences = new MemoryPreferences();
    preferences.failSave = true;
    const store = createToolboxPinsStore(preferences);
    await expect(store.getState().togglePinnedTool('maimai', 'versions')).rejects.toThrow('database unavailable');
    expect(store.getState().pinnedToolIdsByGame.maimai).toEqual([]);
  });
});
