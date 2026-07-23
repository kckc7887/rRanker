import { create } from 'zustand';
import type { Difficulty } from '@/domain/models';
import type { RandomPlayedFilter } from '@/domain/random-charts';
import {
  defaultRandomChartsPreferences,
  randomChartsPreferencesStore,
  type RandomChartsCount,
  type RandomChartsPreferences,
} from '@/features/toolbox/random-charts-preferences';

type RandomChartsFilterState = RandomChartsPreferences & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setCount: (count: RandomChartsCount) => void;
  setDifficulties: (difficulties: Difficulty[]) => void;
  setConstantMin: (constantMin: string) => void;
  setConstantMax: (constantMax: string) => void;
  setPlayed: (played: RandomPlayedFilter) => void;
};

type PreferencesAccess = Pick<typeof randomChartsPreferencesStore, 'load' | 'save'>;

function preferencesFromState(state: RandomChartsPreferences): RandomChartsPreferences {
  return {
    count: state.count,
    difficulties: state.difficulties,
    constantMin: state.constantMin,
    constantMax: state.constantMax,
    played: state.played,
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

    return {
      hydrated: false,
      ...defaultRandomChartsPreferences(),
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

export const useRandomChartsFilter = createRandomChartsFilterStore();
