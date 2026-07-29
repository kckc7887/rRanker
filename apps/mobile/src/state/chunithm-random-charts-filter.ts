import { create } from 'zustand';
import type { ChunithmLevelIndex } from '@/domain/chunithm';
import type { ChunithmRank } from '@/domain/chunithm-score-presentation';
import type { RandomChartsCount } from '@/domain/random-charts';
import {
  chunithmRandomChartsPreferencesStore,
  defaultChunithmRandomChartsPreferences,
  type ChunithmRandomChartsPreferences,
} from '@/features/toolbox/chunithm-random-charts-preferences';

type ChunithmRandomChartsFilterState = ChunithmRandomChartsPreferences & {
  hydrated: boolean;
  collapsed: boolean;
  hydrate: () => Promise<void>;
  setCount: (value: RandomChartsCount) => void;
  setCollapsed: (value: boolean) => void;
  setDifficulty: (value: ChunithmLevelIndex | 'all') => void;
  setVersion: (value: string | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setRankMin: (value: ChunithmRank | null) => void;
  setRankMax: (value: ChunithmRank | null) => void;
  clearFilters: () => void;
};

type PreferencesAccess = Pick<
  typeof chunithmRandomChartsPreferencesStore,
  'load' | 'save'
>;

function preferencesFromState(
  state: ChunithmRandomChartsPreferences,
): ChunithmRandomChartsPreferences {
  return {
    count: state.count,
    difficulty: state.difficulty,
    version: state.version,
    constantMin: state.constantMin,
    constantMax: state.constantMax,
    rankMin: state.rankMin,
    rankMax: state.rankMax,
  };
}

export function createChunithmRandomChartsFilterStore(
  preferences: PreferencesAccess = chunithmRandomChartsPreferencesStore,
) {
  let hydrationPromise: Promise<void> | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let dirtyBeforeHydrate = false;

  return create<ChunithmRandomChartsFilterState>((set, get) => {
    const persist = () => {
      const snapshot = preferencesFromState(get());
      const operation = saveQueue.then(async () => {
        await get().hydrate();
        await preferences.save(snapshot);
      });
      saveQueue = operation.catch(() => undefined);
    };
    const update = (patch: Partial<ChunithmRandomChartsPreferences>) => {
      if (!get().hydrated) dirtyBeforeHydrate = true;
      set(patch);
      persist();
    };
    const clearPatch = () => {
      const defaults = defaultChunithmRandomChartsPreferences();
      return {
        difficulty: defaults.difficulty,
        version: defaults.version,
        constantMin: defaults.constantMin,
        constantMax: defaults.constantMax,
        rankMin: defaults.rankMin,
        rankMax: defaults.rankMax,
      };
    };

    return {
      hydrated: false,
      collapsed: true,
      ...defaultChunithmRandomChartsPreferences(),
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
      setConstantMin: (constantMin) => update({ constantMin }),
      setConstantMax: (constantMax) => update({ constantMax }),
      setRankMin: (rankMin) => update({ rankMin }),
      setRankMax: (rankMax) => update({ rankMax }),
      clearFilters: () => update(clearPatch()),
    };
  });
}

export const useChunithmRandomChartsFilter =
  createChunithmRandomChartsFilterStore();
