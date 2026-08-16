import { createFilterStore } from '@/state/create-filter-store';
import type { ChartType, Difficulty } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';

export const useCatalogFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    type: 'all' as ChartType | 'all',
    difficulty: 'all' as Difficulty | 'all',
    constantMin: '',
    constantMax: '',
    version: 'all' as string | 'all',
    versionLocale: 'china' as VersionNameLocale,
    selectedDxRatingTagIds: [] as number[],
  },
  clearKeys: [
    'keyword', 'type', 'difficulty', 'constantMin', 'constantMax', 'version',
    'selectedDxRatingTagIds',
  ],
});
