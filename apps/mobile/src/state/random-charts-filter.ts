import { create } from 'zustand';
import type { MaimaiFcAchievement, MaimaiFsAchievement } from '@/domain/maimai-filters';
import type { ChartType, Difficulty } from '@/domain/models';
import {
  defaultRandomChartsPreferences,
  randomChartsPreferencesStore,
  type RandomChartsCount,
  type RandomChartsPreferences,
} from '@/features/toolbox/random-charts-preferences';
import type { VersionNameLocale } from '@/domain/version-names';

type RandomChartsFilterState = RandomChartsPreferences & {
  hydrated: boolean;
  collapsed: boolean;
  hydrate: () => Promise<void>;
  setCount: (value: RandomChartsCount) => void;
  setCollapsed: (value: boolean) => void;
  setDifficulty: (value: Difficulty | 'all') => void;
  setVersion: (value: string | 'all') => void;
  setType: (value: ChartType | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setAchievementMin: (value: string) => void;
  setAchievementMax: (value: string) => void;
  setSoloAchievement: (value: MaimaiFcAchievement | null) => void;
  setMultiAchievement: (value: MaimaiFsAchievement | null) => void;
  setVersionLocale: (value: VersionNameLocale) => void;
  clearFilters: () => void;
};

type PreferencesAccess = Pick<typeof randomChartsPreferencesStore, 'load' | 'save'>;

function preferencesFromState(state: RandomChartsPreferences): RandomChartsPreferences {
  return {
    count: state.count,
    difficulty: state.difficulty,
    version: state.version,
    type: state.type,
    constantMin: state.constantMin,
    constantMax: state.constantMax,
    achievementMin: state.achievementMin,
    achievementMax: state.achievementMax,
    soloAchievement: state.soloAchievement,
    multiAchievement: state.multiAchievement,
    versionLocale: state.versionLocale,
  };
}

export function createRandomChartsFilterStore(
  preferences: PreferencesAccess = randomChartsPreferencesStore,
) {
  let hydrationPromise: Promise<void> | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let dirtyBeforeHydrate = false;

  return create<RandomChartsFilterState>((set, get) => {
    const persist = () => {
      const snapshot = preferencesFromState(get());
      const operation = saveQueue.then(async () => {
        await get().hydrate();
        await preferences.save(snapshot);
      });
      saveQueue = operation.catch(() => undefined);
    };
    const update = (patch: Partial<RandomChartsPreferences>) => {
      if (!get().hydrated) dirtyBeforeHydrate = true;
      set(patch);
      persist();
    };
    const clearPatch = () => {
      const defaults = defaultRandomChartsPreferences();
      return {
        difficulty: defaults.difficulty,
        version: defaults.version,
        type: defaults.type,
        constantMin: defaults.constantMin,
        constantMax: defaults.constantMax,
        achievementMin: defaults.achievementMin,
        achievementMax: defaults.achievementMax,
        soloAchievement: defaults.soloAchievement,
        multiAchievement: defaults.multiAchievement,
      };
    };

    return {
      hydrated: false,
      collapsed: true,
      ...defaultRandomChartsPreferences(),
      hydrate: async () => {
        if (get().hydrated) return;
        hydrationPromise ??= preferences.load().then((stored) => {
          if (get().hydrated) return;
          set(dirtyBeforeHydrate ? { hydrated: true } : { hydrated: true, ...stored });
        }).finally(() => {
          hydrationPromise = null;
        });
        await hydrationPromise;
      },
      setCount: (count) => update({ count }),
      setCollapsed: (collapsed) => set({ collapsed }),
      setDifficulty: (difficulty) => update({ difficulty }),
      setVersion: (version) => update({ version }),
      setType: (type) => update({ type }),
      setConstantMin: (constantMin) => update({ constantMin }),
      setConstantMax: (constantMax) => update({ constantMax }),
      setAchievementMin: (achievementMin) => update({ achievementMin }),
      setAchievementMax: (achievementMax) => update({ achievementMax }),
      setSoloAchievement: (soloAchievement) => update({ soloAchievement }),
      setMultiAchievement: (multiAchievement) => update({ multiAchievement }),
      setVersionLocale: (versionLocale) => update({ versionLocale }),
      clearFilters: () => update(clearPatch()),
    };
  });
}

export const useRandomChartsFilter = createRandomChartsFilterStore();
