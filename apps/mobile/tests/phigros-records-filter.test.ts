import { usePhigrosRecordsFilter } from '@/state/phigros-records-filter';

describe('usePhigrosRecordsFilter store', () => {
  beforeEach(() => {
    usePhigrosRecordsFilter.getState().reset();
  });

  it('starts with collapsed empty filters', () => {
    expect(usePhigrosRecordsFilter.getState()).toMatchObject({
      keyword: '',
      collapsed: true,
      level: 'all',
      constantMin: '',
      constantMax: '',
      accuracyMin: '',
      accuracyMax: '',
      rank: null,
    });
  });

  it('updates filter fields independently', () => {
    usePhigrosRecordsFilter.getState().setLevel(3);
    usePhigrosRecordsFilter.getState().setConstantMin('14');
    usePhigrosRecordsFilter.getState().setAccuracyMin('99');
    usePhigrosRecordsFilter.getState().setRank('phi');
    expect(usePhigrosRecordsFilter.getState()).toMatchObject({
      level: 3,
      constantMin: '14',
      accuracyMin: '99',
      rank: 'phi',
    });
  });

  it('clearFilters keeps collapsed preference', () => {
    usePhigrosRecordsFilter.getState().setCollapsed(false);
    usePhigrosRecordsFilter.getState().setKeyword('Glaciaxion');
    usePhigrosRecordsFilter.getState().setLevel(2);
    usePhigrosRecordsFilter.getState().setRank('fc');
    usePhigrosRecordsFilter.getState().clearFilters();
    expect(usePhigrosRecordsFilter.getState()).toMatchObject({
      keyword: '',
      collapsed: false,
      level: 'all',
      rank: null,
    });
  });
});
