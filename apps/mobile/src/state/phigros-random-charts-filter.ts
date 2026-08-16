import {
  defaultPhigrosRandomChartsPreferences,
  phigrosRandomChartsPreferencesStore,
  type PhigrosRandomChartsPreferences,
} from '@/features/toolbox/phigros-random-charts-preferences';
import { createPersistedRandomChartsFilterStore } from '@/state/create-random-charts-filter-store';

type PreferencesAccess = Pick<typeof phigrosRandomChartsPreferencesStore, 'load' | 'save'>;

export function createPhigrosRandomChartsFilterStore(
  preferences: PreferencesAccess = phigrosRandomChartsPreferencesStore,
) {
  return createPersistedRandomChartsFilterStore<PhigrosRandomChartsPreferences>({
    preferences,
    defaults: defaultPhigrosRandomChartsPreferences,
    clearKeys: [
      'level', 'constantMin', 'constantMax', 'accuracyMin', 'accuracyMax',
      'rank', 'xing', 'chapter', 'selectedKyouTagIds',
    ],
  });
}

export const usePhigrosRandomChartsFilter = createPhigrosRandomChartsFilterStore();
