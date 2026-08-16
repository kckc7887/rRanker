import { createFilterStore } from '@/state/create-filter-store';
import type { MaimaiFcAchievement, MaimaiFsAchievement } from '@/domain/maimai-filters';
import type { ChartType, Difficulty } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';

export const useRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    difficulty: 'all' as Difficulty | 'all',
    version: 'all' as string | 'all',
    type: 'all' as ChartType | 'all',
    constantMin: '',
    constantMax: '',
    achievementMin: '',
    achievementMax: '',
    soloAchievement: null as MaimaiFcAchievement | null,
    multiAchievement: null as MaimaiFsAchievement | null,
    selectedDxRatingTagIds: [] as number[],
    sortBy: 'rating' as 'rating' | 'achievements' | 'title',
    versionLocale: 'china' as VersionNameLocale,
  },
  clearKeys: [
    'keyword', 'difficulty', 'version', 'type',
    'constantMin', 'constantMax', 'achievementMin', 'achievementMax',
    'soloAchievement', 'multiAchievement', 'selectedDxRatingTagIds',
  ],
});
