import { createFilterStore } from './create-filter-store';
import { MAJDATA_FILTER_DEFAULTS } from '@/domain/majdata';
const spec = { defaults: { ...MAJDATA_FILTER_DEFAULTS, collapsed: true }, clearKeys: ['difficulties', 'tags', 'min', 'max', 'keyword', 'sort'] as const };
export const useMajdataRecordsFilter = createFilterStore(spec);
export const useMajdataCatalogFilter = createFilterStore(spec);
