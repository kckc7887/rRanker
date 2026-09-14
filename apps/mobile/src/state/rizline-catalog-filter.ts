import { defaultRizlineFilters } from '@/domain/rizline-filters';
import { createFilterStore } from './create-filter-store';

export const useRizlineCatalogFilter = createFilterStore({
  defaults: { ...defaultRizlineFilters(), keyword: '', collapsed: true },
  clearKeys: ['keyword', 'difficulty', 'packId', 'constantMin', 'constantMax'],
});
