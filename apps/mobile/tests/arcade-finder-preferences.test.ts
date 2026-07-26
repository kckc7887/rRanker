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
  it('returns defaults for invalid payloads', () => {
    expect(parseArcadeFinderPreferences(null)).toEqual(defaultArcadeFinderPreferences());
    expect(parseArcadeFinderPreferences({ version: 2, radiusKm: 5 })).toEqual(defaultArcadeFinderPreferences());
  });

  it('keeps valid radius and title ids', () => {
    expect(parseArcadeFinderPreferences({
      version: 1,
      radiusKm: 15,
      titleIds: [1, 1, 3, -1, 'x'],
      extra: true,
    })).toEqual({
      radiusKm: 15,
      titleIds: [1, 3],
    });
  });

  it('falls back to default title ids when empty', () => {
    expect(parseArcadeFinderPreferences({
      version: 1,
      radiusKm: 5,
      titleIds: [],
    })).toEqual({
      radiusKm: 5,
      titleIds: [1],
    });
  });

  it('persists and restores preferences', async () => {
    const storage = new MemoryStore();
    const store = new ArcadeFinderPreferencesStore(storage);
    const value = { radiusKm: 20 as const, titleIds: [1, 3] };
    await store.save(value);
    await expect(store.load()).resolves.toEqual(value);
  });
});
