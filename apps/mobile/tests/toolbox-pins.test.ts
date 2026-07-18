import { emptyPinnedToolIdsByGame, type PinnedToolIdsByGame } from '@/features/toolbox/pinned-tool-preferences';
import { createToolboxPinsStore } from '@/state/toolbox-pins';

class MemoryPreferences {
  value: PinnedToolIdsByGame = emptyPinnedToolIdsByGame();
  failSave = false;

  async load(): Promise<PinnedToolIdsByGame> {
    return structuredClone(this.value);
  }

  async save(value: PinnedToolIdsByGame): Promise<void> {
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
    expect(preferences.value.maimai).toEqual(['rating']);

    await store.getState().togglePinnedTool('maimai', 'rating');
    expect(store.getState().pinnedToolIdsByGame.maimai).toEqual([]);
    expect(preferences.value.maimai).toEqual([]);
  });

  it('rolls back the visible state when persistence fails', async () => {
    const preferences = new MemoryPreferences();
    preferences.failSave = true;
    const store = createToolboxPinsStore(preferences);
    await expect(store.getState().togglePinnedTool('maimai', 'versions')).rejects.toThrow('database unavailable');
    expect(store.getState().pinnedToolIdsByGame.maimai).toEqual([]);
  });
});
