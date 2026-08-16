import { createFilterStore } from '@/state/create-filter-store';
import type { PhigrosLevel } from '@/domain/phigros';

export const usePhigrosCatalogFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    level: 'all' as PhigrosLevel | 'all',
    constantMin: '',
    constantMax: '',
    chapter: 'all' as string | 'all',
    selectedKyouTagIds: [] as number[],
  },
  clearKeys: ['keyword', 'level', 'constantMin', 'constantMax', 'chapter', 'selectedKyouTagIds'],
});
