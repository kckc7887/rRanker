import { createFilterStore } from '@/state/create-filter-store';

export const useOsuRecordsFilter = createFilterStore({
  defaults: {
    keyword: '',
    collapsed: true,
    /** NM 与其他模组互斥。 */
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
