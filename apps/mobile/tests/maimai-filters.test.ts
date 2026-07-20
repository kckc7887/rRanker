import { matchesAchievementRange, matchesConstantRange, parseAchievementBound, parseConstantBound } from '@/domain/maimai-filters';

describe('maimai constant filters', () => {
  it('parses non-negative finite bounds and ignores empty or invalid input', () => {
    expect(parseConstantBound(' 12.6 ')).toBe(12.6);
    expect(parseConstantBound('')).toBeUndefined();
    expect(parseConstantBound('not-a-number')).toBeUndefined();
    expect(parseConstantBound('-1')).toBeUndefined();
  });

  it('uses inclusive constant bounds and supports either open end', () => {
    expect(matchesConstantRange(12.6, '12.6', '14.3')).toBe(true);
    expect(matchesConstantRange(14.3, '12.6', '14.3')).toBe(true);
    expect(matchesConstantRange(12.5, '12.6', '')).toBe(false);
    expect(matchesConstantRange(14.4, '', '14.3')).toBe(false);
  });

  it('matches nothing when a valid constant lower bound exceeds the upper bound', () => {
    expect(matchesConstantRange(13, '14', '12')).toBe(false);
  });
});

describe('maimai achievement filters', () => {
  it('parses achievement bounds between 0 and 101', () => {
    expect(parseAchievementBound(' 100.5 ')).toBe(100.5);
    expect(parseAchievementBound('')).toBeUndefined();
    expect(parseAchievementBound('not-a-number')).toBeUndefined();
    expect(parseAchievementBound('-1')).toBeUndefined();
    expect(parseAchievementBound('101.1')).toBeUndefined();
  });

  it('uses inclusive achievement bounds and supports either open end', () => {
    expect(matchesAchievementRange(100.5, '100', '101')).toBe(true);
    expect(matchesAchievementRange(100.5, '100.5', '')).toBe(true);
    expect(matchesAchievementRange(99.4, '99.5', '')).toBe(false);
    expect(matchesAchievementRange(101.1, '', '101')).toBe(false);
  });

  it('matches nothing when a valid achievement lower bound exceeds the upper bound', () => {
    expect(matchesAchievementRange(100, '101', '99')).toBe(false);
  });
});
