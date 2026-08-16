import { createFilterStore } from '@/state/create-filter-store';
import type { MuseDashAchievementFilter, MuseDashDifficultySlot, MuseDashDlcFilter } from '@/components/musedash/MuseDashFilterBar';

export const useMuseDashRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    difficultySlot: 'all' as MuseDashDifficultySlot,
    dlc: 'all' as MuseDashDlcFilter,
    constantMin: '',
    constantMax: '',
    accMin: '',
    accMax: '',
    achievement: 'all' as MuseDashAchievementFilter,
  },
  clearKeys: ['keyword', 'difficultySlot', 'dlc', 'constantMin', 'constantMax', 'accMin', 'accMax', 'achievement'],
});
