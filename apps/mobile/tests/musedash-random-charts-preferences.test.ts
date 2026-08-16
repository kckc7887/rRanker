import {
  MuseDashRandomChartsPreferencesStore,
  defaultMuseDashRandomChartsPreferences,
  parseMuseDashRandomChartsPreferences,
} from '@/features/toolbox/musedash-random-charts-preferences';
import { createMuseDashRandomChartsFilterStore } from '@/state/musedash-random-charts-filter';

class MemoryStore {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}

describe('musedash random charts preferences', () => {
  it('validates stored fields and returns defaults for invalid data', () => {
    expect(parseMuseDashRandomChartsPreferences(null))
      .toEqual(defaultMuseDashRandomChartsPreferences());
    expect(parseMuseDashRandomChartsPreferences({
      schemaVersion: 1,
      count: 2,
      difficultySlot: 3,
      dlc: ' Festival 主包裹',
      constantMin: ' 11 ',
      constantMax: '13.9',
      accMin: '95',
      accMax: '99',
      achievement: 'ap',
    })).toEqual({
      ...defaultMuseDashRandomChartsPreferences(),
      count: 2,
      difficultySlot: 3,
      dlc: ' Festival 主包裹',
      constantMin: '11',
      constantMax: '13.9',
      accMin: '95',
      accMax: '99',
      achievement: 'ap',
    });
    expect(parseMuseDashRandomChartsPreferences({
      schemaVersion: 1,
      count: 9,
      difficultySlot: 7,
      dlc: '',
      achievement: 'fs',
    })).toEqual(defaultMuseDashRandomChartsPreferences());
  });

  it('starts collapsed and hydrates stored preferences independently', async () => {
    const storage = new MemoryStore();
    const preferences = new MuseDashRandomChartsPreferencesStore(storage);
    await preferences.save({
      ...defaultMuseDashRandomChartsPreferences(),
      count: 4,
      difficultySlot: 2,
      dlc: '某个专辑',
      accMin: '97',
      achievement: 'fc',
    });
    const useStore = createMuseDashRandomChartsFilterStore(preferences);
    expect(useStore.getState().collapsed).toBe(true);
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({
      hydrated: true,
      collapsed: true,
      count: 4,
      difficultySlot: 2,
      dlc: '某个专辑',
      accMin: '97',
      achievement: 'fc',
    });
  });

  it('persists setters and keeps count through clearFilters', async () => {
    const storage = new MemoryStore();
    const preferences = new MuseDashRandomChartsPreferencesStore(storage);
    const useStore = createMuseDashRandomChartsFilterStore(preferences);
    await useStore.getState().hydrate();
    useStore.getState().setCount(3);
    useStore.getState().setDlc('另一个专辑');
    useStore.getState().setAchievement('ap');
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 3,
        dlc: '另一个专辑',
        achievement: 'ap',
      });
    });
    useStore.getState().clearFilters();
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({
        count: 3,
        difficultySlot: 'all',
        dlc: 'all',
        constantMin: '',
        constantMax: '',
        accMin: '',
        accMax: '',
        achievement: 'all',
      });
    });
  });

  it('falls back to defaults and clears corrupt storage on load', async () => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.musedash-random-charts.v1', '{not json');
    const preferences = new MuseDashRandomChartsPreferencesStore(storage);
    await expect(preferences.load()).resolves.toEqual(defaultMuseDashRandomChartsPreferences());
    expect(storage.values.has('rranker.toolbox.musedash-random-charts.v1')).toBe(false);
  });
});
