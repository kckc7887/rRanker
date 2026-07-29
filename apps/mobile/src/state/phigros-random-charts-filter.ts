import { create } from 'zustand';
import type { PhigrosLevel } from '@/domain/phigros';
import type { PhigrosRankFilter } from '@/domain/phigros-filters';
import type { PhigrosXingKind } from '@/domain/phigros-xing';
import {
  defaultPhigrosRandomChartsPreferences,
  phigrosRandomChartsPreferencesStore,
  type PhigrosRandomChartsCount,
  type PhigrosRandomChartsPreferences,
} from '@/features/toolbox/phigros-random-charts-preferences';

type PhigrosRandomChartsFilterState = PhigrosRandomChartsPreferences & {
  hydrated: boolean;
  collapsed: boolean;
  hydrate: () => Promise<void>;
  setCount: (value: PhigrosRandomChartsCount) => void;
  setCollapsed: (value: boolean) => void;
  setLevel: (value: PhigrosLevel | 'all') => void;
  setConstantMin: (value: string) => void;
  setConstantMax: (value: string) => void;
  setAccuracyMin: (value: string) => void;
  setAccuracyMax: (value: string) => void;
  setRank: (value: PhigrosRankFilter | null) => void;
  setXing: (value: PhigrosXingKind | null) => void;
  clearFilters: () => void;
};

type PreferencesAccess = Pick<typeof phigrosRandomChartsPreferencesStore, 'load' | 'save'>;

function preferencesFromState(
  state: PhigrosRandomChartsPreferences,
): PhigrosRandomChartsPreferences {
  return {
    count: state.count,
    level: state.level,
    constantMin: state.constantMin,
    constantMax: state.constantMax,
    accuracyMin: state.accuracyMin,
    accuracyMax: state.accuracyMax,
    rank: state.rank,
    xing: state.xing,
  };
}

export function createPhigrosRandomChartsFilterStore(
  preferences: PreferencesAccess = phigrosRandomChartsPreferencesStore,
) {
  let hydrationPromise: Promise<void> | null = null;
  let saveQueue: Promise<void> = Promise.resolve();
  let dirtyBeforeHydrate = false;

  return create<PhigrosRandomChartsFilterState>((set, get) => {
    const persist = () => {
      const snapshot = preferencesFromState(get());
      const operation = saveQueue.then(async () => {
        await get().hydrate();
        await preferences.save(snapshot);
      });
      saveQueue = operation.catch(() => undefined);
    };
    const update = (patch: Partial<PhigrosRandomChartsPreferences>) => {
      if (!get().hydrated) dirtyBeforeHydrate = true;
      set(patch);
      persist();
    };
    const clearPatch = () => {
      const defaults = defaultPhigrosRandomChartsPreferences();
      return {
        level: defaults.level,
        constantMin: defaults.constantMin,
        constantMax: defaults.constantMax,
        accuracyMin: defaults.accuracyMin,
        accuracyMax: defaults.accuracyMax,
        rank: defaults.rank,
        xing: defaults.xing,
      };
    };

    return {
      hydrated: false,
      collapsed: true,
      ...defaultPhigrosRandomChartsPreferences(),
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
      setLevel: (level) => update({ level }),
      setConstantMin: (constantMin) => update({ constantMin }),
      setConstantMax: (constantMax) => update({ constantMax }),
      setAccuracyMin: (accuracyMin) => update({ accuracyMin }),
      setAccuracyMax: (accuracyMax) => update({ accuracyMax }),
      setRank: (rank) => update({ rank }),
      setXing: (xing) => update({ xing }),
      clearFilters: () => update(clearPatch()),
    };
  });
}

export const usePhigrosRandomChartsFilter = createPhigrosRandomChartsFilterStore();
