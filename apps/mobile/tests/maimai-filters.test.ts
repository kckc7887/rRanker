import { matchesConstantRange, parseConstantBound } from '@/domain/maimai-filters';

describe('maimai constant filters', () => {
  it('parses non-negative finite bounds and ignores empty or invalid input', () => {
    expect(parseConstantBound(' 12.6 ')).toBe(12.6);
    expect(parseConstantBound('')).toBeUndefined();
    expect(parseConstantBound('not-a-number')).toBeUndefined();
    expect(parseConstantBound('-1')).toBeUndefined();
  });

  it('uses inclusive bounds and supports either open end', () => {
    expect(matchesConstantRange(12.6, '12.6', '14.3')).toBe(true);
    expect(matchesConstantRange(14.3, '12.6', '14.3')).toBe(true);
    expect(matchesConstantRange(12.5, '12.6', '')).toBe(false);
    expect(matchesConstantRange(14.4, '', '14.3')).toBe(false);
  });

  it('matches nothing when a valid lower bound exceeds the upper bound', () => {
    expect(matchesConstantRange(13, '14', '12')).toBe(false);
  });
});
