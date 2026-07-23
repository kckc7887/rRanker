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

describe('random charts preferences', () => {
  it('returns defaults for invalid payloads', () => {
    expect(parseRandomChartsPreferences(null)).toEqual(defaultRandomChartsPreferences());
    expect(parseRandomChartsPreferences({ version: 2, count: 3 })).toEqual(defaultRandomChartsPreferences());
  });

  it('keeps valid filter fields and drops unknowns', () => {
    expect(parseRandomChartsPreferences({
      version: 1,
      count: 3,
      difficulties: ['master', 'master', 'unknown', 'remaster'],
      constantMin: ' 13.0 ',
      constantMax: '14',
      played: 'unplayed',
      extra: true,
    })).toEqual({
      count: 3,
      difficulties: ['master', 'remaster'],
      constantMin: '13.0',
      constantMax: '14',
      played: 'unplayed',
    });
  });

  it('persists and restores preferences', async () => {
    const storage = new MemoryStore();
    const store = new RandomChartsPreferencesStore(storage);
    const value = {
      count: 2 as const,
      difficulties: ['expert' as const],
      constantMin: '12',
      constantMax: '13.5',
      played: 'played' as const,
    };
    await store.save(value);
    await expect(store.load()).resolves.toEqual(value);
  });

  it('hydrates zustand state and keeps subsequent edits', async () => {
    const storage = new MemoryStore();
    const preferences = new RandomChartsPreferencesStore(storage);
    await preferences.save({
      count: 4,
      difficulties: ['basic'],
      constantMin: '1',
      constantMax: '8',
      played: 'all',
    });
    const useStore = createRandomChartsFilterStore(preferences);
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({
      hydrated: true,
      count: 4,
      difficulties: ['basic'],
      constantMin: '1',
      constantMax: '8',
      played: 'all',
    });
    useStore.getState().setCount(2);
    useStore.getState().setPlayed('unplayed');
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toEqual({
        count: 2,
        difficulties: ['basic'],
        constantMin: '1',
        constantMax: '8',
        played: 'unplayed',
      });
    });
  });
});
