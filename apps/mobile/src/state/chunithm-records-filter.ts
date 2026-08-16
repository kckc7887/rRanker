import { createFilterStore } from '@/state/create-filter-store';
import type { ChunithmLevelIndex } from '@/domain/chunithm';
import type { ChunithmRank } from '@/domain/chunithm-score-presentation';

export const useChunithmRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    difficulty: 'all' as ChunithmLevelIndex | 'all',
    version: 'all' as string | 'all',
    constantMin: '',
    constantMax: '',
    rankMin: null as ChunithmRank | null,
    rankMax: null as ChunithmRank | null,
  },
  clearKeys: ['keyword', 'difficulty', 'version', 'constantMin', 'constantMax', 'rankMin', 'rankMax'],
});
