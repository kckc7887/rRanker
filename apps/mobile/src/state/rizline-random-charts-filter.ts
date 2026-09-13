import { defaultRizlineRandomChartsPreferences, rizlineRandomChartsPreferencesStore } from '@/features/toolbox/rizline-random-charts-preferences';
import { createPersistedRandomChartsFilterStore } from './create-random-charts-filter-store';

export const useRizlineRandomChartsFilter = createPersistedRandomChartsFilterStore({
  preferences: rizlineRandomChartsPreferencesStore,
  defaults: defaultRizlineRandomChartsPreferences,
  clearKeys: ['difficulty', 'packId', 'constantMin', 'constantMax'],
});
