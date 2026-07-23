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
    expect(parsePhigrosRandomChartsPreferences(null)).toEqual(defaultPhigrosRandomChartsPreferences());
    expect(parsePhigrosRandomChartsPreferences({ version: 2, count: 3 })).toEqual(defaultPhigrosRandomChartsPreferences());
  });

  it('keeps valid filter fields and drops remaster/unknowns', () => {
    expect(parsePhigrosRandomChartsPreferences({
      version: 1,
      count: 3,
      difficulties: ['master', 'master', 'unknown', 'remaster', 'expert'],
      constantMin: ' 13.0 ',
      constantMax: '15',
      played: 'unplayed',
      extra: true,
    })).toEqual({
      count: 3,
      difficulties: ['master', 'expert'],
      constantMin: '13.0',
      constantMax: '15',
      played: 'unplayed',
    });
  });

  it('persists and restores preferences', async () => {
    const storage = new MemoryStore();
    const store = new PhigrosRandomChartsPreferencesStore(storage);
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
    const preferences = new PhigrosRandomChartsPreferencesStore(storage);
    await preferences.save({
      count: 4,
      difficulties: ['basic'],
      constantMin: '1',
      constantMax: '8',
      played: 'all',
    });
    const useStore = createPhigrosRandomChartsFilterStore(preferences);
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
