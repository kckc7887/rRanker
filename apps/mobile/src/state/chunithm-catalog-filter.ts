import { createFilterStore } from '@/state/create-filter-store';
import type { ChunithmLevelIndex } from '@/domain/chunithm';

export const useChunithmCatalogFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    difficulty: 'all' as ChunithmLevelIndex | 'all',
    version: 'all' as string | 'all',
    constantMin: '',
    constantMax: '',
  },
  clearKeys: ['keyword', 'difficulty', 'version', 'constantMin', 'constantMax'],
});
