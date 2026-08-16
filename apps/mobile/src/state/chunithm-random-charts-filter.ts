import {
  chunithmRandomChartsPreferencesStore,
  defaultChunithmRandomChartsPreferences,
  type ChunithmRandomChartsPreferences,
} from '@/features/toolbox/chunithm-random-charts-preferences';
import { createPersistedRandomChartsFilterStore } from '@/state/create-random-charts-filter-store';

type PreferencesAccess = Pick<
  typeof chunithmRandomChartsPreferencesStore,
  'load' | 'save'
>;

export function createChunithmRandomChartsFilterStore(
  preferences: PreferencesAccess = chunithmRandomChartsPreferencesStore,
) {
  return createPersistedRandomChartsFilterStore<ChunithmRandomChartsPreferences>({
    preferences,
    defaults: defaultChunithmRandomChartsPreferences,
    clearKeys: ['difficulty', 'version', 'constantMin', 'constantMax', 'rankMin', 'rankMax'],
  });
}

export const useChunithmRandomChartsFilter =
  createChunithmRandomChartsFilterStore();
