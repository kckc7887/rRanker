import {
  defaultMuseDashRandomChartsPreferences,
  museDashRandomChartsPreferencesStore,
  type MuseDashRandomChartsPreferences,
} from '@/features/toolbox/musedash-random-charts-preferences';
import { createPersistedRandomChartsFilterStore } from '@/state/create-random-charts-filter-store';

type PreferencesAccess = Pick<
  typeof museDashRandomChartsPreferencesStore,
  'load' | 'save'
>;

export function createMuseDashRandomChartsFilterStore(
  preferences: PreferencesAccess = museDashRandomChartsPreferencesStore,
) {
  return createPersistedRandomChartsFilterStore<MuseDashRandomChartsPreferences>({
    preferences,
    defaults: defaultMuseDashRandomChartsPreferences,
    clearKeys: [
      'difficultySlot', 'dlc', 'constantMin', 'constantMax',
      'accMin', 'accMax', 'achievement',
    ],
  });
}

export const useMuseDashRandomChartsFilter =
  createMuseDashRandomChartsFilterStore();
