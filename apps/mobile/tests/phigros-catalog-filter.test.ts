import { usePhigrosCatalogFilter } from '@/state/phigros-catalog-filter';

describe('usePhigrosCatalogFilter store', () => {
  beforeEach(() => usePhigrosCatalogFilter.getState().reset());

  it('starts with collapsed empty filters', () => {
    expect(usePhigrosCatalogFilter.getState()).toEqual(expect.objectContaining({
      keyword: '',
      collapsed: true,
      level: 'all',
      constantMin: '',
      constantMax: '',
    }));
  });

  it('clearFilters keeps collapsed preference', () => {
    usePhigrosCatalogFilter.getState().setCollapsed(false);
    usePhigrosCatalogFilter.getState().setKeyword('test');
    usePhigrosCatalogFilter.getState().setLevel(1);
    usePhigrosCatalogFilter.getState().setConstantMin('12');
    usePhigrosCatalogFilter.getState().clearFilters();
    expect(usePhigrosCatalogFilter.getState()).toEqual(expect.objectContaining({
      keyword: '',
      collapsed: false,
      level: 'all',
      constantMin: '',
      constantMax: '',
    }));
  });

  it('reset restores defaults', () => {
    usePhigrosCatalogFilter.getState().setCollapsed(false);
    usePhigrosCatalogFilter.getState().setLevel(0);
    usePhigrosCatalogFilter.getState().reset();
    expect(usePhigrosCatalogFilter.getState()).toEqual(expect.objectContaining({
      keyword: '',
      collapsed: true,
      level: 'all',
    }));
  });
});
