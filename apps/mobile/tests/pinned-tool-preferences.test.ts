import {
  emptyHomePinPreferences,
  PinnedToolPreferencesStore,
  parseHomePinPreferences,
} from '@/features/toolbox/pinned-tool-preferences';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('pinned tool preferences', () => {
  it('keeps valid tools isolated by game and removes duplicates', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: ['rating', 'rating', 'unknown', 3],
        chunithm: ['rating'],
        phigros: ['rating'],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
    }).pinnedToolIdsByGame).toEqual({ rizline: [], 'majdata-net': [], maimai: ['rating'], chunithm: [], phigros: [], phira: [], adofai: [], musedash: [], 'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [] });
  });

  it('keeps valid plate ids only for games with a plate tool', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { rizline: [], 'majdata-net': [], maimai: [], chunithm: [], phigros: [] },
      pinnedPlateIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: [6101, 6101, -1, 1.5, '6102'],
        chunithm: [6101],
        phigros: [6101],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
    }).pinnedPlateIdsByGame).toEqual({
      rizline: [], 'majdata-net': [], maimai: [6101],
      chunithm: [],
      phigros: [],
      phira: [],
      adofai: [], musedash: [],
      'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
    });
  });

  it('keeps valid chunithm collection pins by kind and removes duplicates', () => {
    expect(parseHomePinPreferences({
      version: 1,
      pinnedToolIdsByGame: { rizline: [], 'majdata-net': [], maimai: [], chunithm: [], phigros: [] },
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
        rizline: [], 'majdata-net': [], maimai: [{ kind: 'trophy', id: 866 }],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
    }).pinnedCollectionIdsByGame).toEqual({
      rizline: [], 'majdata-net': [], maimai: [],
      chunithm: [
        { kind: 'trophy', id: 866 },
        { kind: 'character', id: 16620 },
        { kind: 'plate', id: 1 },
        { kind: 'icon', id: 19 },
        { kind: 'trophy', id: 0 },
      ],
      phigros: [],
      phira: [],
      adofai: [], musedash: [],
      'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
    });
  });

  it('persists and restores pinned tools', async () => {
    const storage = new MemoryStore();
    const store = new PinnedToolPreferencesStore(storage);
    await store.save({
      pinnedToolIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: ['rating', 'versions'],
        chunithm: [],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
      pinnedPlateIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: [6101, 6102],
        chunithm: [],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
      pinnedCollectionIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: [],
        chunithm: [],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
    });
    await expect(store.load()).resolves.toEqual({
      pinnedToolIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: ['rating', 'versions'],
        chunithm: [],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
      pinnedPlateIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: [6101, 6102],
        chunithm: [],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
      pinnedCollectionIdsByGame: {
        rizline: [], 'majdata-net': [], maimai: [],
        chunithm: [],
        phigros: [],
        phira: [],
        adofai: [], musedash: [],
        'osu-standard': [], 'osu-mania': [], 'osu-catch': [], 'osu-taiko': [],
      },
    });
  });

  it('rebuilds malformed preferences with current defaults', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.pinned-tools.v1', '{');
    const store = new PinnedToolPreferencesStore(storage);
    await expect(store.load()).resolves.toEqual(emptyHomePinPreferences());
    expect(JSON.parse(storage.values.get('rranker.toolbox.pinned-tools.v1')!)).toMatchObject(emptyHomePinPreferences());
  });
  it('rebuilds tool-only stored preferences instead of filling newer maps', async () => {
    const storage = new MemoryStore(), store = new PinnedToolPreferencesStore(storage);
    storage.values.set('rranker.toolbox.pinned-tools.v1', JSON.stringify({ version: 1, pinnedToolIdsByGame: { maimai: ['rating'] } }));
    await expect(store.load()).resolves.toEqual(emptyHomePinPreferences());
    expect(JSON.parse(storage.values.get('rranker.toolbox.pinned-tools.v1')!)).toEqual({ version: 1, ...emptyHomePinPreferences() });
  });

});
