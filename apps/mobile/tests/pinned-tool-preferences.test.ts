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
        chunithm: ['rating'],
        phigros: ['rating'],
        test: [],
      },
    })).toEqual({ maimai: ['rating'], chunithm: [], phigros: [], adofai: [], test: [] });
  });

  it('keeps valid plate ids only for games with a plate tool', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { maimai: [], chunithm: [], phigros: [], test: [] },
      pinnedPlateIdsByGame: {
        maimai: [6101, 6101, -1, 1.5, '6102'],
        chunithm: [6101],
        phigros: [6101],
        test: [],
      },
    }).pinnedPlateIdsByGame).toEqual({
      maimai: [6101],
      chunithm: [],
      phigros: [],
      adofai: [],
      test: [],
    });
  });

  it('migrates existing tool-only preferences with empty plate pins', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { maimai: ['rating'], phigros: [], test: [] },
    })).toEqual({
      pinnedToolIdsByGame: { maimai: ['rating'], chunithm: [], phigros: [], adofai: [], test: [] },
      pinnedPlateIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], test: [] },
      pinnedCollectionIdsByGame: { maimai: [], chunithm: [], phigros: [], adofai: [], test: [] },
    });
  });

  it('keeps valid chunithm collection pins by kind and removes duplicates', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { maimai: [], chunithm: [], phigros: [], test: [] },
      pinnedCollectionIdsByGame: {
        chunithm: [
          { kind: 'trophy', id: 866 },
          { kind: 'trophy', id: 866 },
          { kind: 'character', id: 16620 },
          { kind: 'plate', id: 1 },
          { kind: 'icon', id: 19 },
          { kind: 'trophy', id: 0 },
          { kind: 'unknown', id: 5 },
          { kind: 'trophy', id: -1 },
        ],
        maimai: [{ kind: 'trophy', id: 866 }],
        phigros: [],
        adofai: [],
        test: [],
      },
    }).pinnedCollectionIdsByGame).toEqual({
      maimai: [],
      chunithm: [
        { kind: 'trophy', id: 866 },
        { kind: 'character', id: 16620 },
        { kind: 'plate', id: 1 },
        { kind: 'icon', id: 19 },
        { kind: 'trophy', id: 0 },
      ],
      phigros: [],
      adofai: [],
      test: [],
    });
  });

  it('persists and restores pinned tools', async () => {
    const storage = new MemoryStore();
    const store = new PinnedToolPreferencesStore(storage);
    await store.save({
      pinnedToolIdsByGame: {
        maimai: ['rating', 'versions'],
        chunithm: [],
        phigros: [],
        adofai: [],
        test: [],
      },
      pinnedPlateIdsByGame: {
        maimai: [6101, 6102],
        chunithm: [],
        phigros: [],
        adofai: [],
        test: [],
      },
      pinnedCollectionIdsByGame: {
        maimai: [],
        chunithm: [],
        phigros: [],
        adofai: [],
        test: [],
      },
    });
    await expect(store.load()).resolves.toEqual({
      pinnedToolIdsByGame: {
        maimai: ['rating', 'versions'],
        chunithm: [],
        phigros: [],
        adofai: [],
        test: [],
      },
      pinnedPlateIdsByGame: {
        maimai: [6101, 6102],
        chunithm: [],
        phigros: [],
        adofai: [],
        test: [],
      },
      pinnedCollectionIdsByGame: {
        maimai: [],
        chunithm: [],
        phigros: [],
        adofai: [],
        test: [],
      },
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
