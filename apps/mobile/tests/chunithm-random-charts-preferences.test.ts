import {
  ChunithmRandomChartsPreferencesStore,
  defaultChunithmRandomChartsPreferences,
  parseChunithmRandomChartsPreferences,
} from '@/features/toolbox/chunithm-random-charts-preferences';
import { createChunithmRandomChartsFilterStore } from '@/state/chunithm-random-charts-filter';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('chunithm random charts preferences', () => {
  it('validates stored fields and returns defaults for invalid data', () => {
    expect(parseChunithmRandomChartsPreferences(null))
      .toEqual(defaultChunithmRandomChartsPreferences());
    expect(parseChunithmRandomChartsPreferences({
      schemaVersion: 1,
      count: 3,
      difficulty: 5,
      version: '2',
      constantMin: ' 13 ',
      rankMin: 'SS',
      rankMax: 'SSS+',
    })).toEqual({
      ...defaultChunithmRandomChartsPreferences(),
      count: 3,
      difficulty: 5,
      version: '2',
      constantMin: '13',
      rankMin: 'SS',
      rankMax: 'SSS+',
    });
  });

  it('persists and hydrates independently', async () => {
    const storage = new MemoryStore();
    const preferences = new ChunithmRandomChartsPreferencesStore(storage);
    await preferences.save({
      ...defaultChunithmRandomChartsPreferences(),
      count: 4,
      difficulty: 3,
      rankMin: 'S',
    });
    const useStore = createChunithmRandomChartsFilterStore(preferences);
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({
      hydrated: true,
      count: 4,
      difficulty: 3,
      rankMin: 'S',
    });
    useStore.getState().setRankMax('SSS+');
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 4,
        difficulty: 3,
        rankMin: 'S',
        rankMax: 'SSS+',
      });
    });
  });
});
