import {
  matchesPhigrosLevel,
  matchesPhigrosRankFilter,
  phigrosLevelToDifficulty,
  phigrosRankFilterLabel,
} from '@/domain/phigros-filters';

describe('phigros level filters', () => {
  it('maps EZ/HD/IN/AT to shared difficulty enums', () => {
    expect(phigrosLevelToDifficulty(0)).toBe('basic');
    expect(phigrosLevelToDifficulty(1)).toBe('advanced');
    expect(phigrosLevelToDifficulty(2)).toBe('expert');
    expect(phigrosLevelToDifficulty(3)).toBe('master');
  });

  it('matches level index when a specific level is selected', () => {
    expect(matchesPhigrosLevel(2, 'all')).toBe(true);
    expect(matchesPhigrosLevel(2, 2)).toBe(true);
    expect(matchesPhigrosLevel(3, 2)).toBe(false);
  });
});

describe('phigros rank filters', () => {
  it('labels rank filters', () => {
    expect(phigrosRankFilterLabel(null)).toBe('全部');
    expect(phigrosRankFilterLabel('phi')).toBe('φ');
    expect(phigrosRankFilterLabel('fc')).toBe('FC');
  });

  it('matches phi as million score', () => {
    expect(matchesPhigrosRankFilter({ dxScore: 1_000_000, fc: 'ap' }, 'phi')).toBe(true);
    expect(matchesPhigrosRankFilter({ dxScore: 999_000, fc: 'ap' }, 'phi')).toBe(false);
  });

  it('matches FC excluding phi', () => {
    expect(matchesPhigrosRankFilter({ dxScore: 980_000, fc: 'ap' }, 'fc')).toBe(true);
    expect(matchesPhigrosRankFilter({ dxScore: 1_000_000, fc: 'ap' }, 'fc')).toBe(false);
    expect(matchesPhigrosRankFilter({ dxScore: 980_000, fc: null }, 'fc')).toBe(false);
  });

  it('matches grade ranks strictly via score rate', () => {
    expect(matchesPhigrosRankFilter({ dxScore: 970_000, fc: null }, 'v')).toBe(true);
    expect(matchesPhigrosRankFilter({ dxScore: 940_000, fc: null }, 's')).toBe(true);
    expect(matchesPhigrosRankFilter({ dxScore: 940_000, fc: null }, 'v')).toBe(false);
    expect(matchesPhigrosRankFilter({ dxScore: 980_000, fc: 'ap' }, 'v')).toBe(true);
    expect(matchesPhigrosRankFilter({ dxScore: 1_000_000, fc: 'ap' }, 'v')).toBe(false);
  });

  it('allows all ranks when filter is null', () => {
    expect(matchesPhigrosRankFilter({ dxScore: 100, fc: null }, null)).toBe(true);
  });
});
