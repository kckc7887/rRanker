import {
  PinnedToolPreferencesStore,
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

  it('persists and restores pinned tools', async () => {
    const storage = new MemoryStore();
    const store = new PinnedToolPreferencesStore(storage);
    await store.save({ maimai: ['rating', 'versions'], phigros: [], test: [] });
    await expect(store.load()).resolves.toEqual({
      maimai: ['rating', 'versions'],
      phigros: [],
      test: [],
    });
  });

  it('clears malformed storage without blocking the toolbox', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.pinned-tools.v1', '{');
    const store = new PinnedToolPreferencesStore(storage);
    await expect(store.load()).resolves.toEqual({ maimai: [], phigros: [], test: [] });
    expect(storage.values.size).toBe(0);
  });
});
