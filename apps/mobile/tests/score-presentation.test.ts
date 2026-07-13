import {
  formatAchievement, isNearMissAchievement, normalizeScoreRate, scoreRateEffect, scoreRateLabel,
} from '@/domain/score-presentation';

describe('score presentation rules', () => {
  it('maps verified rate codes to labels and effects without guessing unknown values', () => {
    expect(normalizeScoreRate(' SSSP ')).toBe('sssp');
    expect(scoreRateLabel('sssp')).toBe('SSS+');
    expect(scoreRateLabel('ssp')).toBe('SS+');
    expect(scoreRateEffect('sssp')).toBe('flowing-rainbow');
    expect(scoreRateEffect('sss')).toBe('rainbow');
    expect(scoreRateEffect('ssp')).toBe('flowing-gold');
    expect(scoreRateEffect('ss')).toBe('gold');
    expect(normalizeScoreRate('future_rate')).toBe('unknown');
    expect(scoreRateLabel('future_rate')).toBe('FUTURE_RATE');
    expect(scoreRateEffect('future_rate')).toBe('normal');
  });

  it.each([
    [99.8999, false], [99.9, true], [99.9999, true], [100, false],
    [100.4899, false], [100.49, true], [100.4999, true], [100.5, false],
  ])('matches the displayed four-decimal 寸 ranges for %f', (value, expected) => {
    expect(formatAchievement(value)).toMatch(/^\d+\.\d{4}%$/);
    expect(isNearMissAchievement(value)).toBe(expected);
  });
});
