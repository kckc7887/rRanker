import { createFilterStore } from '@/state/create-filter-store';
import type { MuseDashDifficultySlot, MuseDashDlcFilter } from '@/components/musedash/MuseDashFilterBar';

export const useMuseDashCatalogFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    difficultySlot: 'all' as MuseDashDifficultySlot,
    dlc: 'all' as MuseDashDlcFilter,
    constantMin: '',
    constantMax: '',
  },
  clearKeys: ['keyword', 'difficultySlot', 'dlc', 'constantMin', 'constantMax'],
});
