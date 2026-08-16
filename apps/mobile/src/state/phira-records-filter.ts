import { createFilterStore } from '@/state/create-filter-store';
import type { PhigrosRankFilter } from '@/domain/phigros-filters';
import type { PhigrosXingKind } from '@/domain/phigros-xing';
import type { PhiraScoreSort } from '@/domain/phira-filters';

export const usePhiraRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    constantMin: '',
    constantMax: '',
    accuracyMin: '',
    accuracyMax: '',
    rank: null as PhigrosRankFilter | null,
    xing: null as PhigrosXingKind | null,
    sort: 'score' as PhiraScoreSort,
  },
  // 原实现 clearFilters === set(DEFAULTS)：含 collapsed 与 sort 全量恢复
  clearKeys: [
    'keyword', 'collapsed', 'constantMin', 'constantMax', 'accuracyMin', 'accuracyMax',
    'rank', 'xing', 'sort',
  ],
});
