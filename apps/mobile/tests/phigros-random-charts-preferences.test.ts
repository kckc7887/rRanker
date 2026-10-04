import {
  defaultPhigrosRandomChartsPreferences,
  parsePhigrosRandomChartsPreferences,
  PhigrosRandomChartsPreferencesStore,
} from '@/features/toolbox/phigros-random-charts-preferences';
import { createPhigrosRandomChartsFilterStore } from '@/state/phigros-random-charts-filter';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('phigros random charts preferences', () => {
  it('returns defaults for invalid payloads', () => {
    expect(parsePhigrosRandomChartsPreferences(null))
      .toEqual(defaultPhigrosRandomChartsPreferences());
  });

  it('persists the complete independent records-style filter', async () => {
    const storage = new MemoryStore();
    const store = new PhigrosRandomChartsPreferencesStore(storage);
    const value = {
      ...defaultPhigrosRandomChartsPreferences(),
      count: 2 as const,
      level: 2 as const,
      constantMin: '12',
      constantMax: '13.5',
      accuracyMin: '99',
      rank: 'v' as const,
      xing: 'good' as const,
      chapter: '4' as const,
      selectedKyouTagIds: [152, 156],
    };
    await store.save(value);
    await expect(store.load()).resolves.toEqual(value);
  });

  it('parses chapter only when all or numeric, otherwise falls back to all', () => {
    expect(parsePhigrosRandomChartsPreferences({
      version: 3,
      chapter: '7',
    }).chapter).toBe('7');
    expect(parsePhigrosRandomChartsPreferences({
      version: 3,
      chapter: 'abc',
    }).chapter).toBe('all');
    expect(parsePhigrosRandomChartsPreferences({
      version: 3,
    }).chapter).toBe('all');
    expect(parsePhigrosRandomChartsPreferences({
      version: 3,
      chapter: 'all',
    }).chapter).toBe('all');
  });

  it('hydrates Zustand state and persists subsequent edits', async () => {
    const storage = new MemoryStore();
    const preferences = new PhigrosRandomChartsPreferencesStore(storage);
    await preferences.save({
      ...defaultPhigrosRandomChartsPreferences(),
      count: 4,
      level: 0,
      constantMin: '1',
      constantMax: '8',
    });
    const useStore = createPhigrosRandomChartsFilterStore(preferences);
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({
      hydrated: true,
      count: 4,
      level: 0,
      constantMin: '1',
      constantMax: '8',
    });
    useStore.getState().setCount(2);
    useStore.getState().setRank('v');
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 2,
        level: 0,
        rank: 'v',
      });
    });
  });
  it.each([1, 2])('rebuilds old version %s with current defaults', async version => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.phigros-random-charts.v1', JSON.stringify({ version: version, count: 3, difficulties: ['master'] }));
    const store = new PhigrosRandomChartsPreferencesStore(storage);
    await expect(store.load()).resolves.toEqual(defaultPhigrosRandomChartsPreferences());
    expect(JSON.parse(storage.values.get('rranker.toolbox.phigros-random-charts.v1')!)).toEqual({ version: 3, ...defaultPhigrosRandomChartsPreferences() });
  });

});
