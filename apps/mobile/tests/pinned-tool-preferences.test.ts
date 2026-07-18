import {
  emptyHomePinPreferences,
  PinnedToolPreferencesStore,
  parseHomePinPreferences,
  parsePinnedToolPreferences,
} from '@/features/toolbox/pinned-tool-preferences';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('pinned tool preferences', () => {
  it('keeps valid tools isolated by game and removes duplicates', () => {
    expect(parsePinnedToolPreferences({
      version: 1,
      pinnedToolIdsByGame: {
        maimai: ['rating', 'rating', 'unknown', 3],
        phigros: ['rating'],
        test: [],
      },
    })).toEqual({ maimai: ['rating'], phigros: [], test: [] });
  });

  it('keeps valid plate ids only for games with a plate tool', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { maimai: [], phigros: [], test: [] },
      pinnedPlateIdsByGame: {
        maimai: [6101, 6101, -1, 1.5, '6102'],
        phigros: [6101],
        test: [],
      },
    }).pinnedPlateIdsByGame).toEqual({ maimai: [6101], phigros: [], test: [] });
  });

  it('migrates existing tool-only preferences with empty plate pins', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { maimai: ['rating'], phigros: [], test: [] },
    })).toEqual({
      pinnedToolIdsByGame: { maimai: ['rating'], phigros: [], test: [] },
      pinnedPlateIdsByGame: { maimai: [], phigros: [], test: [] },
    });
  });

  it('persists and restores pinned tools', async () => {
    const storage = new MemoryStore();
    const store = new PinnedToolPreferencesStore(storage);
    await store.save({
      pinnedToolIdsByGame: { maimai: ['rating', 'versions'], phigros: [], test: [] },
      pinnedPlateIdsByGame: { maimai: [6101, 6102], phigros: [], test: [] },
    });
    await expect(store.load()).resolves.toEqual({
      pinnedToolIdsByGame: { maimai: ['rating', 'versions'], phigros: [], test: [] },
      pinnedPlateIdsByGame: { maimai: [6101, 6102], phigros: [], test: [] },
    });
  });

  it('clears malformed storage without blocking the toolbox', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.pinned-tools.v1', '{');
    const store = new PinnedToolPreferencesStore(storage);
    await expect(store.load()).resolves.toEqual(emptyHomePinPreferences());
    expect(storage.values.size).toBe(0);
  });
});
