import {
  defaultTufRandomChartsPreferences,
  tufRandomChartsPreferencesStore,
  type TufRandomChartsPreferences,
} from '@/features/toolbox/tuf-random-charts-preferences';
import { createPersistedRandomChartsFilterStore } from '@/state/create-random-charts-filter-store';

type PreferencesAccess = Pick<
  typeof tufRandomChartsPreferencesStore,
  'load' | 'save'
>;

export function createTufRandomChartsFilterStore(
  preferences: PreferencesAccess = tufRandomChartsPreferencesStore,
) {
  return createPersistedRandomChartsFilterStore<TufRandomChartsPreferences>({
    preferences,
    defaults: defaultTufRandomChartsPreferences,
    clearKeys: [
      'difficultyBand', 'difficultyMin', 'difficultyMax',
      'includeSpecial', 'achievement',
    ],
  });
}

export const useTufRandomChartsFilter =
  createTufRandomChartsFilterStore();
