import type { RandomChartsCount } from '@/domain/random-charts';
import { defaultRizlineFilters, type RizlineFilters } from '@/domain/rizline-filters';
import { createPreferencesStore } from '@/storage/create-preferences-store';

export type RizlineRandomChartsPreferences = RizlineFilters & { count: RandomChartsCount };
export const defaultRizlineRandomChartsPreferences = (): RizlineRandomChartsPreferences => ({
  ...defaultRizlineFilters(), count: 1,
});

export function parseRizlineRandomChartsPreferences(value: unknown): RizlineRandomChartsPreferences {
  const result = defaultRizlineRandomChartsPreferences();
  if (!value || typeof value !== 'object') return result;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) return result;
  if (typeof raw.count === 'number' && [1, 2, 3, 4].includes(raw.count)) result.count = raw.count as RandomChartsCount;
  if (typeof raw.difficulty === 'string' && ['all', 'EZ', 'HD', 'IN', 'AT', 'SP'].includes(raw.difficulty)) {
    result.difficulty = raw.difficulty as RizlineFilters['difficulty'];
  }
  if (typeof raw.packId === 'string' && raw.packId.trim()) result.packId = raw.packId;
  for (const key of ['constantMin', 'constantMax'] as const) {
    if (typeof raw[key] === 'string' && raw[key].trim() && Number.isFinite(Number(raw[key]))) result[key] = raw[key].trim().slice(0, 16);
  }
  return result;
}

const { Store: RizlineRandomChartsPreferencesStore } = createPreferencesStore<RizlineRandomChartsPreferences>({
  storeKey: 'rranker.toolbox.rizline-random-charts.v1',
  defaults: defaultRizlineRandomChartsPreferences,
  parse: parseRizlineRandomChartsPreferences,
  toStored: (preferences) => ({ version: 1, ...parseRizlineRandomChartsPreferences({ ...preferences, version: 1 }) }),
});
export { RizlineRandomChartsPreferencesStore };
export const rizlineRandomChartsPreferencesStore = new RizlineRandomChartsPreferencesStore();
