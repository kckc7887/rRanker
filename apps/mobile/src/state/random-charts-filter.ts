import {
  defaultRandomChartsPreferences,
  randomChartsPreferencesStore,
  type RandomChartsPreferences,
} from '@/features/toolbox/random-charts-preferences';
import { createPersistedRandomChartsFilterStore } from '@/state/create-random-charts-filter-store';

type PreferencesAccess = Pick<typeof randomChartsPreferencesStore, 'load' | 'save'>;

export function createRandomChartsFilterStore(
  preferences: PreferencesAccess = randomChartsPreferencesStore,
) {
  return createPersistedRandomChartsFilterStore<RandomChartsPreferences>({
    preferences,
    defaults: defaultRandomChartsPreferences,
    clearKeys: [
      'difficulty', 'version', 'type', 'constantMin', 'constantMax',
      'achievementMin', 'achievementMax', 'soloAchievement', 'multiAchievement',
      'selectedDxRatingTagIds',
    ],
  });
}

export const useRandomChartsFilter = createRandomChartsFilterStore();
