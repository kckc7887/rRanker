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

  it('merges edits made during restoration with untouched stored filters', async () => {
    const storage = new MemoryStore();
    const preferences = new RandomChartsPreferencesStore(storage);
    await preferences.save({ ...defaultRandomChartsPreferences(), count: 4, difficulty: 'master', version: '保存版本', selectedDxRatingTagIds: [3] });
    let finishRead!: () => void;
    const readGate = new Promise<void>((resolve) => { finishRead = resolve; });
    const read = storage.getItem.bind(storage);
    storage.getItem = async (key) => { await readGate; return read(key); };
    const useStore = createRandomChartsFilterStore(preferences);
    const hydration = useStore.getState().hydrate();
    useStore.getState().setCount(2);
    useStore.getState().setAchievementMin('98');
    useStore.getState().setCount(3);
    finishRead();
    await hydration;
    expect(useStore.getState()).toMatchObject({ hydrated: true, count: 3, difficulty: 'master', version: '保存版本', achievementMin: '98', selectedDxRatingTagIds: [3] });
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({ count: 3, difficulty: 'master', version: '保存版本', achievementMin: '98', selectedDxRatingTagIds: [3] });
    });
  });

  it('retains pending edits after a read failure and saves them when restoration succeeds', async () => {
    const storage = new MemoryStore();
    const preferences = new RandomChartsPreferencesStore(storage);
    await preferences.save({ ...defaultRandomChartsPreferences(), count: 4, difficulty: 'master', constantMin: '12' });
    vi.spyOn(storage, 'getItem').mockRejectedValueOnce(new Error('read failed'));
    const useStore = createRandomChartsFilterStore(preferences);
    const hydration = useStore.getState().hydrate();
    useStore.getState().setCount(2);
    await expect(hydration).rejects.toThrow('read failed');
    await useStore.getState().hydrate();
    expect(useStore.getState()).toMatchObject({ count: 2, difficulty: 'master', constantMin: '12', hydrated: true });
    await vi.waitFor(async () => {
      await expect(preferences.load()).resolves.toMatchObject({ count: 2, difficulty: 'master', constantMin: '12' });
    });
  });
  it.each([1, 2])('rebuilds old version %s with current defaults', async version => {
    const storage = new MemoryStore();
    storage.values.set('rranker.toolbox.random-charts.v1', JSON.stringify({ schemaVersion: version, count: 3, difficulties: ['master'] }));
    const store = new RandomChartsPreferencesStore(storage);
    await expect(store.load()).resolves.toEqual(defaultRandomChartsPreferences());
    expect(JSON.parse(storage.values.get('rranker.toolbox.random-charts.v1')!)).toEqual({ schemaVersion: 3, ...defaultRandomChartsPreferences() });
  });

});
