import {
  calculateChunithmOverPower,
  chunithmChartRatingDisplay,
  chunithmRatingTable,
  maxChunithmChartRating,
  maxChunithmOverPower,
  minimumScoreForChunithmOverPower,
  minimumScoreForChunithmRating,
  parseChunithmChartInput,
} from '@/domain/chunithm-rating';

describe('chunithm rating formula', () => {
  it('computes maximum ratings from chart constants', () => {
    expect(maxChunithmChartRating(13.7)).toBeCloseTo(15.85, 2);
    expect(maxChunithmChartRating(14.0)).toBeCloseTo(16.15, 2);
    expect(maxChunithmChartRating(15.5)).toBeCloseTo(17.65, 2);
    expect(maxChunithmChartRating(13.705)).toBe(chunithmChartRatingDisplay(13.705, 1_009_000));
  });

  it('computes maximum over power from chart constants', () => {
    expect(maxChunithmOverPower(13.7)).toBeCloseTo(83.5, 2);
    expect(maxChunithmOverPower(14.0)).toBeCloseTo(85, 2);
    expect(maxChunithmOverPower(15.5)).toBeCloseTo(92.5, 2);
  });

  it('computes the 1009000 score rating as constant + 2.15', () => {
    expect(chunithmChartRatingDisplay(13.7, 1_009_000)).toBeCloseTo(15.85, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_010_000)).toBeCloseTo(15.85, 9);
    expect(chunithmChartRatingDisplay(12.0, 1_009_000)).toBeCloseTo(14.15, 9);
  });

  it('computes mid-tier ratings with the piecewise linear formula', () => {
    expect(chunithmChartRatingDisplay(13.7, 1_007_500)).toBeCloseTo(15.7, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_005_000)).toBeCloseTo(15.2, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_000_000)).toBeCloseTo(14.7, 9);
    expect(chunithmChartRatingDisplay(13.7, 975_000)).toBeCloseTo(13.7, 9);
    expect(chunithmChartRatingDisplay(13.7, 900_000)).toBeCloseTo(8.7, 9);
  });

  it('floors the displayed rating to two decimals', () => {
    expect(chunithmChartRatingDisplay(13.7, 1_002_500)).toBeCloseTo(14.95, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_002_501)).toBeCloseTo(14.95, 9);
  });

  it('floors fractional ratings for display', () => {
    /** 14.7099 展示截断为 14.70。 */
    expect(chunithmChartRatingDisplay(13.7, 1_000_099)).toBeCloseTo(14.7, 9);
    /** 14.69996 展示截断为 14.69。 */
    expect(chunithmChartRatingDisplay(13.7, 999_999)).toBeCloseTo(14.69, 9);
    expect(chunithmChartRatingDisplay(13.7, 974_999)).toBeCloseTo(13.69, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_007_500)).toBe(15.7);
  });

  it('floors negative ratings at zero', () => {
    /** 定数 1.0、850000 分的原始 Rating 为 -3，展示钳为 0。 */
    expect(chunithmChartRatingDisplay(1.0, 850_000)).toBe(0);
    expect(chunithmChartRatingDisplay(1.0, 600_000)).toBe(0);
    expect(chunithmChartRatingDisplay(1.0, 900_000)).toBe(0);
    expect(chunithmChartRatingDisplay(13.7, 850_000)).toBeCloseTo(6.52, 9);
  });

  it('computes over power from the full-precision rating inside 975000~1007500', () => {
    /** OP 使用原始 Rating：5×14.7099=73.5495。 */
    expect(calculateChunithmOverPower(13.7, 1_000_099, 'none')).toBeCloseTo(73.5495, 9);
    expect(calculateChunithmOverPower(13.7, 1_000_099, 'aj')).toBeCloseTo(74.5495, 9);
    expect(calculateChunithmOverPower(13.7, 1_000_099, 'ajc')).toBeCloseTo(74.7995, 9);
    expect(calculateChunithmOverPower(13.7, 999_999, 'none')).toBeCloseTo(73.4998, 9);
    expect(calculateChunithmOverPower(13.7, 1_007_499, 'none')).toBeCloseTo(78.499, 9);
    expect(calculateChunithmOverPower(13.7, 1_005_000, 'none')).toBeCloseTo(76, 9);
  });

  it('computes over power with official lamp bonuses', () => {
    const ajc = calculateChunithmOverPower(13.7, 1_009_000, 'ajc');
    const aj = calculateChunithmOverPower(13.7, 1_009_000, 'aj');
    const fc = calculateChunithmOverPower(13.7, 1_009_000, 'fc');
    const none = calculateChunithmOverPower(13.7, 1_009_000, 'none');
    expect(ajc - aj).toBeCloseTo(0.25, 9);
    expect(aj - none).toBeCloseTo(1.0, 9);
    expect(fc - none).toBeCloseTo(0.5, 9);
  });

  it('computes over power with the official 1007500+ bonus', () => {
    expect(calculateChunithmOverPower(13.7, 1_009_000, 'none')).toBeCloseTo(80.75, 9);
    expect(calculateChunithmOverPower(13.7, 975_000, 'none')).toBeCloseTo(68.5, 9);
  });

  it('keeps over power continuous across the 1007500 branch boundary', () => {
    expect(calculateChunithmOverPower(13.7, 1_007_500, 'none')).toBeCloseTo(78.5, 9);
    expect(calculateChunithmOverPower(13.7, 1_007_501, 'none')).toBeCloseTo(78.5015, 9);
    expect(calculateChunithmOverPower(13.7, 1_008_999, 'none')).toBeCloseTo(80.7485, 9);
  });

  it('returns zero for invalid inputs', () => {
    expect(chunithmChartRatingDisplay(13.7, 0)).toBe(0);
    expect(chunithmChartRatingDisplay(13.7, -1)).toBe(0);
    expect(calculateChunithmOverPower(13.7, 0, 'aj')).toBe(0);
    expect(chunithmChartRatingDisplay(Number.NaN, 1_000_000)).toBe(0);
    expect(chunithmChartRatingDisplay(Number.POSITIVE_INFINITY, 1_000_000)).toBe(0);
    expect(calculateChunithmOverPower(Number.POSITIVE_INFINITY, 1_000_000, 'aj')).toBe(0);
    expect(calculateChunithmOverPower(13.7, Number.NaN, 'aj')).toBe(0);
    expect(calculateChunithmOverPower(13.7, Number.POSITIVE_INFINITY, 'aj')).toBe(0);
  });

  it('returns zero over power below 975000', () => {
    expect(calculateChunithmOverPower(13.7, 974_999, 'ajc')).toBe(0);
    expect(calculateChunithmOverPower(13.7, 960_000, 'ajc')).toBe(0);
    expect(calculateChunithmOverPower(13.7, 900_000, 'aj')).toBe(0);
    expect(calculateChunithmOverPower(13.7, 500_000, 'fc')).toBe(0);
  });

  it('caps over power at the AJC maximum for 1010000', () => {
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'ajc')).toBeCloseTo(83.5, 9);
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'ajc'))
      .toBeCloseTo(maxChunithmOverPower(13.7), 9);
    expect(maxChunithmOverPower(13.7)).toBeCloseTo(83.5, 9);
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'none')).toBeCloseTo(82.25, 9);
  });

  it('matches the hand-computed table around every piecewise boundary', () => {
    const rows: readonly [score: number, display: number, overPower: number][] = [
      [974_999, 13.69, 0],
      [975_000, 13.7, 68.5],
      [975_001, 13.7, 68.5002],
      [989_999, 14.29, 71.4998],
      [990_000, 14.3, 71.5],
      [990_001, 14.3, 71.5002],
      [999_999, 14.69, 73.4998],
      [1_000_000, 14.7, 73.5],
      [1_000_001, 14.7, 73.5005],
      [1_004_999, 15.19, 75.9995],
      [1_005_000, 15.2, 76],
      [1_005_001, 15.2, 76.001],
      [1_007_499, 15.69, 78.499],
      [1_007_500, 15.7, 78.5],
      [1_007_501, 15.7, 78.5015],
      [1_008_999, 15.84, 80.7485],
      [1_009_000, 15.85, 80.75],
      [1_009_001, 15.85, 80.7515],
      [1_009_999, 15.85, 82.2485],
      [1_010_000, 15.85, 82.25],
    ];
    for (const [score, display, overPower] of rows) {
      expect(chunithmChartRatingDisplay(13.7, score)).toBe(display);
      expect(calculateChunithmOverPower(13.7, score, 'none')).toBeCloseTo(overPower, 9);
    }
  });

  it('reverses a target rating into the minimum score of the displayed rating', () => {
    const result = minimumScoreForChunithmRating(13.7, 15.0, 'none');
    expect(result).toEqual({ status: 'reachable', score: 1_003_000, lampMinScore: 0 });
    expect(chunithmChartRatingDisplay(13.7, result.score!)).toBeGreaterThanOrEqual(15.0);
    expect(chunithmChartRatingDisplay(13.7, result.score! - 1)).toBeLessThan(15.0);
    expect(minimumScoreForChunithmRating(13.7, 14.999, 'none').score).toBe(1_003_000);
    expect(minimumScoreForChunithmRating(13.7, 14.99, 'none').score).toBe(1_002_900);
    expect(chunithmChartRatingDisplay(13.7, 1_002_899)).toBe(14.98);
  });

  it('reports unreachable targets instead of a score', () => {
    expect(minimumScoreForChunithmRating(13.7, 999, 'none'))
      .toEqual({ status: 'unreachable', score: null, lampMinScore: 0 });
    expect(minimumScoreForChunithmRating(13.7, 0, 'none').status).toBe('unreachable');
    expect(minimumScoreForChunithmRating(13.7, 15.86, 'none').status).toBe('unreachable');
    expect(minimumScoreForChunithmRating(13.7, Number.NaN, 'none').status).toBe('unreachable');
    expect(minimumScoreForChunithmOverPower(13.7, 9999, 'aj'))
      .toEqual({ status: 'unreachable', score: null, lampMinScore: 1_000_000 });
    expect(minimumScoreForChunithmOverPower(13.7, Number.NaN, 'none').status).toBe('unreachable');
    expect(calculateChunithmOverPower(13.7, 0, 'aj')).toBe(0);
  });

  it('reverses a target over power into the minimum score', () => {
    const result = minimumScoreForChunithmOverPower(13.7, 80, 'aj');
    expect(result).toEqual({ status: 'reachable', score: 1_007_834, lampMinScore: 1_000_000 });
    expect(calculateChunithmOverPower(13.7, result.score!, 'aj')).toBeGreaterThanOrEqual(80);
    expect(calculateChunithmOverPower(13.7, result.score! - 1, 'aj')).toBeLessThan(80);
    expect(minimumScoreForChunithmOverPower(13.7, 73.52, 'none').score).toBe(1_000_040);
    expect(calculateChunithmOverPower(13.7, 1_000_039, 'none')).toBeLessThan(73.52);
    expect(minimumScoreForChunithmOverPower(13.7, 1, 'none'))
      .toEqual({ status: 'reachable', score: 975_000, lampMinScore: 0 });
  });

  it('builds a descending score tier table', () => {
    const rows = chunithmRatingTable(13.7, 'aj');
    expect(rows[0]).toMatchObject({ score: 1_010_000 });
    expect(rows[rows.length - 1]).toMatchObject({ score: 900_000 });
    for (let index = 0; index < rows.length - 1; index += 1) {
      expect(rows[index]!.score).toBeGreaterThan(rows[index + 1]!.score);
      expect(rows[index]!.rating).toBeGreaterThanOrEqual(rows[index + 1]!.rating);
    }
  });
});

describe('chunithm reverse minimum score contract', () => {
  it('returns the exact minimum score when the target sits on a floating point boundary', () => {
    /** 80.558−78.5=2.058，除以 0.0015 需 1372 分，即 1008872。 */
    const result = minimumScoreForChunithmOverPower(13.7, 80.558, 'none');
    expect(result).toEqual({ status: 'reachable', score: 1_008_872, lampMinScore: 0 });
    /** 浮点误差可能将 80.558 算成 80.557999 并多报 1 分。 */
    expect(calculateChunithmOverPower(13.7, 1_008_872, 'none')).toBeGreaterThanOrEqual(80.558);
    expect(calculateChunithmOverPower(13.7, 1_008_871, 'none')).toBeLessThan(80.558);
  });

  it('respects the AJC minimum score when reversing targets', () => {
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_007_667, clear: 'ajc' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJC 至少需要 1,010,000 分。' }]);
    const overPower = minimumScoreForChunithmOverPower(13.7, 80, 'ajc');
    expect(overPower).toEqual({ status: 'reachable', score: 1_010_000, lampMinScore: 1_010_000 });
    const rating = minimumScoreForChunithmRating(13.7, 15.0, 'ajc');
    expect(rating).toEqual({ status: 'reachable', score: 1_010_000, lampMinScore: 1_010_000 });
  });
});

describe('chunithm chart input parsing', () => {
  it('accepts a legal level, score and lamp combination', () => {
    const parsed = parseChunithmChartInput({ levelValue: 13.7, score: 1_010_000, clear: 'ajc' });
    expect(parsed.violations).toEqual([]);
    expect(parsed.levelValue).toBe(13.7);
    expect(parsed.score).toBe(1_010_000);
    expect(parsed.clear).toBe('ajc');
    expect(parsed.lampMinScore).toBe(1_010_000);
  });

  it('reports the level and score ranges instead of computing with illegal values', () => {
    expect(parseChunithmChartInput({ levelValue: 0, score: 1_000_000, clear: 'none' }).violations)
      .toEqual([{ code: 'level_out_of_range', message: '定数必须大于 0 且不超过 16。' }]);
    expect(parseChunithmChartInput({ levelValue: 16.1, score: 1_000_000, clear: 'none' }).violations[0]?.code)
      .toBe('level_out_of_range');
    expect(parseChunithmChartInput({ levelValue: Number.NaN, score: 1_000_000, clear: 'none' }).violations[0]?.code)
      .toBe('level_out_of_range');
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_010_001, clear: 'none' }).violations)
      .toEqual([{ code: 'score_out_of_range', message: '分数必须在 0 到 1,010,000 之间。' }]);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: -1, clear: 'none' }).violations[0]?.code)
      .toBe('score_out_of_range');
    expect(parseChunithmChartInput({ levelValue: 13.7, score: Number.NaN, clear: 'none' }).violations[0]?.code)
      .toBe('score_out_of_range');
    const normalized = parseChunithmChartInput({ levelValue: Number.NaN, score: 1_000_000, clear: 'none' });
    expect(normalized.levelValue).toBe(0);
  });

  it('rejects lamp and score combinations that cannot happen in game', () => {
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_009_999, clear: 'ajc' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJC 至少需要 1,010,000 分。' }]);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 999_999, clear: 'aj' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJ 至少需要 1,000,000 分。' }]);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_000_000, clear: 'aj' }).violations)
      .toEqual([]);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 900_000, clear: 'fc' }).violations)
      .toEqual([]);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1, clear: 'none' }).violations)
      .toEqual([]);
  });

  it('collects every in-range violation at once, ordered by level, score then lamp', () => {
    const parsed = parseChunithmChartInput({ levelValue: 99, score: 1_000, clear: 'ajc' });
    expect(parsed.violations.map((violation) => violation.code))
      .toEqual(['level_out_of_range', 'lamp_score_conflict']);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_010_001, clear: 'ajc' }).violations)
      .toEqual([{ code: 'score_out_of_range', message: '分数必须在 0 到 1,010,000 之间。' }]);
  });
});
