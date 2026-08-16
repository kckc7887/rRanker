import {
  TufRandomChartsPreferencesStore,
  defaultTufRandomChartsPreferences,
  parseTufRandomChartsPreferences,
} from '@/features/toolbox/tuf-random-charts-preferences';
import { createTufRandomChartsFilterStore } from '@/state/tuf-random-charts-filter';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('tuf random charts preferences', () => {
  it('validates stored fields and returns defaults for invalid data', () => {
    expect(parseTufRandomChartsPreferences(null))
      .toEqual(defaultTufRandomChartsPreferences());
    expect(parseTufRandomChartsPreferences({
      schemaVersion: 1,
      count: 2,
      difficultyBand: 'G',
      difficultyMin: ' 10 ',
      difficultyMax: '15',
      includeSpecial: false,
      achievement: 'wf',
    })).toEqual({
      ...defaultTufRandomChartsPreferences(),
      count: 2,
      difficultyBand: 'G',
      difficultyMin: '10',
      difficultyMax: '15',
      includeSpecial: false,
      achievement: 'wf',
    });
    expect(parseTufRandomChartsPreferences({
      schemaVersion: 1,
      count: 9,
      difficultyBand: 'X',
      includeSpecial: 'yes',
      achievement: 'pp?',
    })).toEqual(defaultTufRandomChartsPreferences());
  });

  it('starts collapsed and hydrates stored preferences independently', async () => {
    const storage = new MemoryStore();
    const preferences = new TufRandomChartsPreferencesStore(storage);
    await preferences.save({
      ...defaultTufRandomChartsPreferences(),
      count: 4,
      difficultyBand: 'P',
      difficultyMin: '5',
      difficultyMax: '9',
      includeSpecial: false,
      achievement: 'pp',
    });
    const useStore = createTufRandomChartsFilterStore(preferences);
    expect(useStore.getState().collapsed).toBe(true);
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({
      hydrated: true,
      collapsed: true,
      count: 4,
      difficultyBand: 'P',
      difficultyMin: '5',
      difficultyMax: '9',
      includeSpecial: false,
      achievement: 'pp',
    });
  });

  it('persists setters and keeps count through clearFilters', async () => {
    const storage = new MemoryStore();
    const preferences = new TufRandomChartsPreferencesStore(storage);
    const useStore = createTufRandomChartsFilterStore(preferences);
    await useStore.getState().hydrate();
    useStore.getState().setCount(3);
    useStore.getState().setDifficultyBand('U');
    useStore.getState().setIncludeSpecial(false);
    useStore.getState().setAchievement('wf');
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 3,
        difficultyBand: 'U',
        includeSpecial: false,
        achievement: 'wf',
      });
    });
    useStore.getState().clearFilters();
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 3,
        difficultyBand: 'all',
        difficultyMin: '',
        difficultyMax: '',
        includeSpecial: true,
        achievement: 'all',
      });
    });
  });

  it('falls back to defaults and clears corrupt storage on load', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.tuf-random-charts.v1', '{not json');
    const preferences = new TufRandomChartsPreferencesStore(storage);
    await expect(preferences.load()).resolves.toEqual(defaultTufRandomChartsPreferences());
    expect(storage.values.has('rranker.toolbox.tuf-random-charts.v1')).toBe(false);
  });
});
