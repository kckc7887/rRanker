import { useCatalogFilter } from '@/state/catalog-filter';

describe('useCatalogFilter store', () => {
  beforeEach(() => useCatalogFilter.getState().reset());

  it('keeps lightweight filter state while catalog content is unmounted', () => {
    const state = useCatalogFilter.getState();
    state.setKeyword('宴会场');
    state.setDifficulty('master');
    state.setType('DX');
    state.setConstantMin('13.0');
    state.setConstantMax('14.9');
    state.setVersion('25500');
    state.setVersionLocale('japan');
    state.setCollapsed(true);

    expect(useCatalogFilter.getState()).toEqual(expect.objectContaining({
      keyword: '宴会场',
      difficulty: 'master',
      type: 'DX',
      constantMin: '13.0',
      constantMax: '14.9',
      version: '25500',
      versionLocale: 'japan',
      collapsed: true,
    }));
  });

  it('resets every filter to its default', () => {
    useCatalogFilter.getState().setKeyword('test');
    useCatalogFilter.getState().setVersionLocale('japan');
    useCatalogFilter.getState().setCollapsed(true);
    useCatalogFilter.getState().reset();
    expect(useCatalogFilter.getState()).toEqual(expect.objectContaining({
      keyword: '', collapsed: false, type: 'all', difficulty: 'all', constantMin: '', constantMax: '', version: 'all', versionLocale: 'china',
    }));
  });
});
