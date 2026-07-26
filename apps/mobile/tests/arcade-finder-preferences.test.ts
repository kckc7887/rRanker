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
  it('defaults by game: maimai selects 舞萌DX, phigros selects none', () => {
    expect(defaultArcadeFinderPreferences('maimai')).toEqual({
      radiusKm: 10,
      titleIds: [1],
    });
    expect(defaultArcadeFinderPreferences('phigros')).toEqual({
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
    await store.save('phigros', { radiusKm: 5, titleIds: [] });
    await expect(store.load('maimai')).resolves.toEqual({ radiusKm: 20, titleIds: [1, 3] });
    await expect(store.load('phigros')).resolves.toEqual({ radiusKm: 5, titleIds: [] });
  });

  it('migrates legacy shared key into maimai prefs', async () => {
    const storage = new MemoryStore();
    await storage.setItem('rranker.toolbox.arcade-finder.v1', JSON.stringify({
      version: 1,
      radiusKm: 15,
      titleIds: [1],
    }));
    const store = new ArcadeFinderPreferencesStore(storage);
    await expect(store.load('maimai')).resolves.toEqual({ radiusKm: 15, titleIds: [1] });
    expect(await storage.getItem('rranker.toolbox.arcade-finder.v1')).toBeNull();
    await expect(store.load('phigros')).resolves.toEqual(defaultArcadeFinderPreferences('phigros'));
  });
});
