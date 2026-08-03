import {
  defaultRandomChartsPreferences,
  parseRandomChartsPreferences,
  RandomChartsPreferencesStore,
} from '@/features/toolbox/random-charts-preferences';
import { createRandomChartsFilterStore } from '@/state/random-charts-filter';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('maimai random charts preferences', () => {
  it('returns defaults for invalid payloads', () => {
    expect(parseRandomChartsPreferences(null)).toEqual(defaultRandomChartsPreferences());
    expect(parseRandomChartsPreferences({ schemaVersion: 9, count: 3 }))
      .toEqual(defaultRandomChartsPreferences());
  });

  it('migrates legacy count, one difficulty and constants while dropping played', () => {
    expect(parseRandomChartsPreferences({
      version: 1,
      count: 3,
      difficulties: ['master'],
      constantMin: ' 13.0 ',
      constantMax: '14',
      played: 'unplayed',
    })).toEqual({
      ...defaultRandomChartsPreferences(),
      count: 3,
      difficulty: 'master',
      constantMin: '13.0',
      constantMax: '14',
    });
    expect(parseRandomChartsPreferences({
      version: 1,
      difficulties: ['master', 'remaster'],
    }).difficulty).toBe('all');
  });

  it('persists the complete independent records-style filter', async () => {
    const storage = new MemoryStore();
    const store = new RandomChartsPreferencesStore(storage);
    const value = {
      ...defaultRandomChartsPreferences(),
      count: 2 as const,
      difficulty: 'expert' as const,
      version: '旧版本',
      type: 'DX' as const,
      achievementMin: '99',
      soloAchievement: 'fc' as const,
      selectedDxRatingTagIds: [1, 3],
      versionLocale: 'japan' as const,
    };
    await store.save(value);
    await expect(store.load()).resolves.toEqual(value);
  });

  it('parses v3 tag ids and drops invalid or duplicate entries', () => {
    expect(parseRandomChartsPreferences({
      schemaVersion: 3,
      count: 3,
      selectedDxRatingTagIds: [1, 2.5, -1, 2, 1, '3', null, Infinity],
    })).toEqual({
      ...defaultRandomChartsPreferences(),
      count: 3,
      selectedDxRatingTagIds: [1, 2],
    });
  });

  it('migrates v2 payloads with an empty tag selection', () => {
    expect(parseRandomChartsPreferences({
      schemaVersion: 2,
      count: 2,
      difficulty: 'master',
      type: 'UTAGE',
    })).toEqual({
      ...defaultRandomChartsPreferences(),
      count: 2,
      difficulty: 'master',
      type: 'UTAGE',
    });
  });

  it('hydrates Zustand state and persists subsequent edits', async () => {
    const storage = new MemoryStore();
    const preferences = new RandomChartsPreferencesStore(storage);
    await preferences.save({
      ...defaultRandomChartsPreferences(),
      count: 4,
      difficulty: 'basic',
      constantMin: '1',
      constantMax: '8',
    });
    const useStore = createRandomChartsFilterStore(preferences);
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({
      hydrated: true,
      count: 4,
      difficulty: 'basic',
      constantMin: '1',
      constantMax: '8',
    });
    useStore.getState().setCount(2);
    useStore.getState().setAchievementMin('98');
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 2,
        difficulty: 'basic',
        achievementMin: '98',
      });
    });
  });
});
