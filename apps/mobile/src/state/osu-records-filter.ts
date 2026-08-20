import { createFilterStore } from '@/state/create-filter-store';

export const useOsuRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    // 选中模组 acronym（含 'NM' 无模组特殊值，与其余互斥，互斥由筛选栏回调保证）。
    mods: [] as string[],
    accuracyMin: '',
    accuracyMax: '',
    starMin: '',
    starMax: '',
    ppMin: '',
    ppMax: '',
  },
  clearKeys: [
    'keyword', 'mods', 'accuracyMin', 'accuracyMax', 'starMin', 'starMax', 'ppMin', 'ppMax',
  ],
});
