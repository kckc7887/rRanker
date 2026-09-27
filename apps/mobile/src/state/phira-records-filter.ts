import { createFilterStore } from '@/state/create-filter-store';
import type { PhiraRankFilter , PhiraScoreSort } from '@/domain/phira-filters';
import type { PhiraXingKind } from '@/domain/phira-score-presentation';

export const usePhiraRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    constantMin: '',
    constantMax: '',
    accuracyMin: '',
    accuracyMax: '',
    rank: null as PhiraRankFilter | null,
    xing: null as PhiraXingKind | null,
    sort: 'score' as PhiraScoreSort,
  },
  // 清除筛选时同时恢复折叠状态和排序。
  clearKeys: [
    'keyword', 'collapsed', 'constantMin', 'constantMax', 'accuracyMin', 'accuracyMax',
    'rank', 'xing', 'sort',
  ],
});
