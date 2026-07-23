import { create } from 'zustand';
import type { Difficulty } from '@/domain/models';
import type { RandomPlayedFilter } from '@/domain/random-charts';
import {
  defaultPhigrosRandomChartsPreferences,
  phigrosRandomChartsPreferencesStore,
  type PhigrosRandomChartsCount,
  type PhigrosRandomChartsPreferences,
} from '@/features/toolbox/phigros-random-charts-preferences';

type PhigrosRandomChartsFilterState = PhigrosRandomChartsPreferences & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setCount: (count: PhigrosRandomChartsCount) => void;
  setDifficulties: (difficulties: Difficulty[]) => void;
  setConstantMin: (constantMin: string) => void;
  setConstantMax: (constantMax: string) => void;
  setPlayed: (played: RandomPlayedFilter) => void;
};

type PreferencesAccess = Pick<typeof phigrosRandomChartsPreferencesStore, 'load' | 'save'>;

function preferencesFromState(state: PhigrosRandomChartsPreferences): PhigrosRandomChartsPreferences {
  return {
    count: state.count,
    difficulties: state.difficulties,
    constantMin: state.constantMin,
    constantMax: state.constantMax,
    played: state.played,
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

    return {
      hydrated: false,
      ...defaultPhigrosRandomChartsPreferences(),
      hydrate: async () => {
        if (get().hydrated) return;
        hydrationPromise ??= preferences.load().then((stored) => {
          if (get().hydrated) return;
          if (dirtyBeforeHydrate) {
            set({ hydrated: true });
            return;
          }
          set({ hydrated: true, ...stored });
        }).finally(() => {
          hydrationPromise = null;
        });
        await hydrationPromise;
      },
      setCount: (count) => update({ count }),
      setDifficulties: (difficulties) => update({ difficulties }),
      setConstantMin: (constantMin) => update({ constantMin }),
      setConstantMax: (constantMax) => update({ constantMax }),
      setPlayed: (played) => update({ played }),
    };
  });
}

export const usePhigrosRandomChartsFilter = createPhigrosRandomChartsFilterStore();
