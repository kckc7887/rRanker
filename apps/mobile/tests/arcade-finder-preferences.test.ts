import {
  ArcadeFinderPreferencesStore,
  defaultArcadeFinderPreferences,
  parseArcadeFinderPreferences,
} from '@/features/toolbox/arcade-finder-preferences';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('arcade finder preferences', () => {
  it('defaults by game: maimai selects 舞萌DX, chunithm selects 中二节奏, others select none', () => {
    expect(defaultArcadeFinderPreferences('maimai')).toEqual({
      radiusKm: 10,
      titleIds: [1],
    });
    expect(defaultArcadeFinderPreferences('chunithm')).toEqual({
      radiusKm: 10,
      titleIds: [3],
    });
    expect(defaultArcadeFinderPreferences('phigros')).toEqual({
      radiusKm: 10,
      titleIds: [],
    });
    expect(defaultArcadeFinderPreferences('adofai')).toEqual({ radiusKm: 10, titleIds: [] });
    expect(defaultArcadeFinderPreferences('musedash')).toEqual({ radiusKm: 10, titleIds: [] });
    expect(defaultArcadeFinderPreferences('phira')).toEqual({
      radiusKm: 10,
      titleIds: [],
    });
  });

  it('returns defaults for invalid payloads', () => {
    expect(parseArcadeFinderPreferences(null, 'maimai')).toEqual(defaultArcadeFinderPreferences('maimai'));
    expect(parseArcadeFinderPreferences({ version: 2, radiusKm: 5 }, 'phigros'))
      .toEqual(defaultArcadeFinderPreferences('phigros'));
  });

  it('keeps valid radius and title ids including empty', () => {
    expect(parseArcadeFinderPreferences({
      version: 1,
      radiusKm: 15,
      titleIds: [1, 1, 3, -1, 'x'],
      extra: true,
    }, 'maimai')).toEqual({
      radiusKm: 15,
      titleIds: [1, 3],
    });

    expect(parseArcadeFinderPreferences({
      version: 1,
      radiusKm: 5,
      titleIds: [],
    }, 'phigros')).toEqual({
      radiusKm: 5,
      titleIds: [],
    });
  });

  it('persists preferences per game', async () => {
    const storage = new MemoryStore();
    const store = new ArcadeFinderPreferencesStore(storage);
    await store.save('maimai', { radiusKm: 20, titleIds: [1, 3] });
    await store.save('chunithm', { radiusKm: 15, titleIds: [3, 27] });
    await store.save('phigros', { radiusKm: 5, titleIds: [] });
    await expect(store.load('maimai')).resolves.toEqual({ radiusKm: 20, titleIds: [1, 3] });
    await expect(store.load('chunithm')).resolves.toEqual({ radiusKm: 15, titleIds: [3, 27] });
    await expect(store.load('phigros')).resolves.toEqual({ radiusKm: 5, titleIds: [] });
  });

  it('rebuilds unsupported data only for its game', async () => {
    const storage = new MemoryStore(), store = new ArcadeFinderPreferencesStore(storage);
    await store.save('chunithm', { radiusKm: 20, titleIds: [3] });
    const other = storage.values.get('rranker.toolbox.arcade-finder.v1:chunithm');
    storage.values.set('rranker.toolbox.arcade-finder.v1:maimai', JSON.stringify({ version: 0, radiusKm: 5, titleIds: [] }));
    await expect(store.load('maimai')).resolves.toEqual(defaultArcadeFinderPreferences('maimai'));
    expect(storage.values.get('rranker.toolbox.arcade-finder.v1:chunithm')).toBe(other);
  });

});
