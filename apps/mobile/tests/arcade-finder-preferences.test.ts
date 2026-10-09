import {
  ArcadeFinderPreferencesStore,
  defaultArcadeFinderPreferences,
} from '@/features/toolbox/arcade-finder-preferences';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('arcade finder preferences', () => {
  it('defaults to 0–10 km and any machine for every game', async () => {
    const store = new ArcadeFinderPreferencesStore(new MemoryStore());
    for (const gameId of ['maimai', 'chunithm', 'phigros', 'adofai', 'musedash', 'phira'] as const) {
      await expect(store.load(gameId)).resolves.toEqual({ minDistanceKm: 0, radiusKm: 10, titleIds: [] });
    }
    expect(defaultArcadeFinderPreferences()).toEqual({
      minDistanceKm: 0,
      radiusKm: 10,
      titleIds: [],
    });
  });

  it('persists preferences per game', async () => {
    const storage = new MemoryStore();
    const store = new ArcadeFinderPreferencesStore(storage);
    await store.save('maimai', { minDistanceKm: 7, radiusKm: 23, titleIds: [1, 3] });
    await store.save('chunithm', { minDistanceKm: 0, radiusKm: 30, titleIds: [3, 27] });
    await store.save('phigros', { minDistanceKm: 0, radiusKm: 0, titleIds: [] });
    await expect(store.load('maimai')).resolves.toEqual({ minDistanceKm: 7, radiusKm: 23, titleIds: [1, 3] });
    await expect(store.load('chunithm')).resolves.toEqual({ minDistanceKm: 0, radiusKm: 30, titleIds: [3, 27] });
    await expect(store.load('phigros')).resolves.toEqual({ minDistanceKm: 0, radiusKm: 0, titleIds: [] });
  });

  it.each([
    { version: 0, minDistanceKm: 0, radiusKm: 5, titleIds: [] },
    { version: 1, radiusKm: 10, titleIds: [1] },
    { version: 1, minDistanceKm: 20, radiusKm: 10, titleIds: [] },
    { version: 1, minDistanceKm: 0, radiusKm: 31, titleIds: [] },
    { version: 1, minDistanceKm: -1, radiusKm: 10, titleIds: [] },
  ])('rebuilds unsupported data only for its game: %j', async stored => {
    const storage = new MemoryStore(), store = new ArcadeFinderPreferencesStore(storage);
    await store.save('chunithm', { minDistanceKm: 2, radiusKm: 20, titleIds: [3] });
    const other = storage.values.get('rranker.toolbox.arcade-finder.v1:chunithm');
    storage.values.set('rranker.toolbox.arcade-finder.v1:maimai', JSON.stringify(stored));
    await expect(store.load('maimai')).resolves.toEqual(defaultArcadeFinderPreferences());
    expect(JSON.parse(storage.values.get('rranker.toolbox.arcade-finder.v1:maimai')!)).toEqual({
      version: 1, minDistanceKm: 0, radiusKm: 10, titleIds: [],
    });
    expect(storage.values.get('rranker.toolbox.arcade-finder.v1:chunithm')).toBe(other);
  });

  it('preserves stored preferences on read failure', async () => {
    const storage = new MemoryStore(), store = new ArcadeFinderPreferencesStore(storage);
    await store.save('maimai', { minDistanceKm: 5, radiusKm: 30, titleIds: [1] });
    storage.getItem = async () => { throw new Error('read failed'); };
    await expect(store.load('maimai')).rejects.toThrow('read failed');
    expect(JSON.parse(storage.values.get('rranker.toolbox.arcade-finder.v1:maimai')!)).toEqual({
      version: 1, minDistanceKm: 5, radiusKm: 30, titleIds: [1],
    });
  });
});
