import {
  CHUNITHM_CLEAR_TIER_MIN_SCORE,
  calculateChunithmOverPower,
  chunithmChartRatingDisplay,
  chunithmRatingTable,
  formulaMinimumScoreForChunithmOverPower,
  formulaMinimumScoreForChunithmRating,
  maxChunithmChartRating,
  maxChunithmOverPower,
  minimumScoreForChunithmOverPower,
  minimumScoreForChunithmRating,
  parseChunithmChartInput,
  rawChunithmChartRating,
  type ChunithmClearTier,
} from '@/domain/chunithm-rating';

describe('chunithm rating formula', () => {
  it('keeps the max rating anchors consistent with the maxed test provider', () => {
    expect(maxChunithmChartRating(13.7)).toBeCloseTo(15.85, 2);
    expect(maxChunithmChartRating(14.0)).toBeCloseTo(16.15, 2);
    expect(maxChunithmChartRating(15.5)).toBeCloseTo(17.65, 2);
    expect(maxChunithmChartRating(13.705)).toBe(chunithmChartRatingDisplay(13.705, 1_009_000));
  });

  it('keeps the max over power anchors consistent with the maxed test provider', () => {
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

  it('keeps the full-precision rating separate from the displayed rating', () => {
    /** 14.7099 展示截断为 14.70。 */
    expect(rawChunithmChartRating(13.7, 1_000_099)).toBeCloseTo(14.7099, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_000_099)).toBeCloseTo(14.7, 9);
    /** 14.69996 展示截断为 14.69。 */
    expect(rawChunithmChartRating(13.7, 999_999)).toBeCloseTo(14.69996, 9);
    expect(chunithmChartRatingDisplay(13.7, 999_999)).toBeCloseTo(14.69, 9);
    expect(rawChunithmChartRating(13.7, 974_999)).toBeCloseTo(13.6999333333, 9);
    expect(chunithmChartRatingDisplay(13.7, 974_999)).toBeCloseTo(13.69, 9);
    expect(rawChunithmChartRating(13.7, 1_007_500)).toBe(15.7);
    expect(chunithmChartRatingDisplay(13.7, 1_007_500)).toBe(15.7);
  });

  it('keeps raw a mathematical intermediate and the display value floored at zero', () => {
    /** 定数 1.0、850000 分的原始 Rating 为 -3，展示钳为 0。 */
    expect(rawChunithmChartRating(1.0, 850_000)).toBeCloseTo(-3, 9);
    expect(chunithmChartRatingDisplay(1.0, 850_000)).toBe(0);
    expect(rawChunithmChartRating(1.0, 600_000)).toBeCloseTo(-0.6666666667, 9);
    expect(chunithmChartRatingDisplay(1.0, 600_000)).toBe(0);
    expect(rawChunithmChartRating(1.0, 900_000)).toBe(0);
    expect(chunithmChartRatingDisplay(1.0, 900_000)).toBe(0);
    expect(rawChunithmChartRating(13.7, 850_000)).toBeCloseTo(6.525, 9);
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
    expect(rawChunithmChartRating(Number.NaN, 1_000_000)).toBe(0);
    expect(rawChunithmChartRating(13.7, Number.NaN)).toBe(0);
    expect(chunithmChartRatingDisplay(Number.POSITIVE_INFINITY, 1_000_000)).toBe(0);
    expect(rawChunithmChartRating(13.7, Number.POSITIVE_INFINITY)).toBe(0);
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
    const rows: readonly [score: number, raw: number, display: number, overPower: number][] = [
      [974_999, 13.699933333333333, 13.69, 0],
      [975_000, 13.7, 13.7, 68.5],
      [975_001, 13.70004, 13.7, 68.5002],
      [989_999, 14.29996, 14.29, 71.4998],
      [990_000, 14.3, 14.3, 71.5],
      [990_001, 14.30004, 14.3, 71.5002],
      [999_999, 14.69996, 14.69, 73.4998],
      [1_000_000, 14.7, 14.7, 73.5],
      [1_000_001, 14.7001, 14.7, 73.5005],
      [1_004_999, 15.1999, 15.19, 75.9995],
      [1_005_000, 15.2, 15.2, 76],
      [1_005_001, 15.2002, 15.2, 76.001],
      [1_007_499, 15.6998, 15.69, 78.499],
      [1_007_500, 15.7, 15.7, 78.5],
      [1_007_501, 15.7001, 15.7, 78.5015],
      [1_008_999, 15.8499, 15.84, 80.7485],
      [1_009_000, 15.85, 15.85, 80.75],
      [1_009_001, 15.85, 15.85, 80.7515],
      [1_009_999, 15.85, 15.85, 82.2485],
      [1_010_000, 15.85, 15.85, 82.25],
    ];
    for (const [score, raw, display, overPower] of rows) {
      expect(rawChunithmChartRating(13.7, score)).toBeCloseTo(raw, 9);
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
    expect(formulaMinimumScoreForChunithmRating(13.7, 999)).toBeNull();
    expect(formulaMinimumScoreForChunithmRating(13.7, 15.86)).toBeNull();
    expect(minimumScoreForChunithmOverPower(13.7, 9999, 'aj'))
      .toEqual({ status: 'unreachable', score: null, lampMinScore: 1_000_000 });
    expect(minimumScoreForChunithmOverPower(13.7, Number.NaN, 'none').status).toBe('unreachable');
    expect(formulaMinimumScoreForChunithmOverPower(13.7, 9999, 'aj')).toBeNull();
    expect(formulaMinimumScoreForChunithmOverPower(13.7, 0, 'aj')).toBeNull();
    expect(calculateChunithmOverPower(13.7, 0, 'aj')).toBe(0);
  });

  it('reverses a target over power into the minimum score', () => {
    const result = minimumScoreForChunithmOverPower(13.7, 80, 'aj');
    expect(result).toEqual({ status: 'reachable', score: 1_007_834, lampMinScore: 1_000_000 });
    expect(calculateChunithmOverPower(13.7, result.score!, 'aj')).toBeGreaterThanOrEqual(80);
    expect(calculateChunithmOverPower(13.7, result.score! - 1, 'aj')).toBeLessThan(80);
    expect(formulaMinimumScoreForChunithmOverPower(13.7, 73.52, 'none')).toBe(1_000_040);
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

const ORACLE_BONUS_UNITS: Readonly<Record<ChunithmClearTier, number>> = {
  ajc: 37_500, aj: 30_000, fc: 15_000, none: 0,
};

/** [段起点, 段内基准, 每分增量]，单位为 OP×30000。 */
const ORACLE_SEGMENTS: readonly (readonly [origin: number, base: number, step: number])[] = [
  [975_000, 0, 6],
  [990_000, 90_000, 6],
  [1_000_000, 150_000, 15],
  [1_005_000, 225_000, 30],
  [1_007_500, 300_000, 45],
];

function oracleOverPowerUnits(
  levelValue: number,
  score: number,
  clear: ChunithmClearTier,
): number {
  if (score < 975_000) return 0;
  const fixed = Math.round(levelValue * 10_000);
  let units = 0;
  for (const [origin, base, step] of ORACLE_SEGMENTS) {
    if (score >= origin) units = 15 * fixed + base + step * (score - origin);
  }
  return units + ORACLE_BONUS_UNITS[clear];
}

function oracleMinimumScoreForOverPower(
  levelValue: number,
  targetOverPower: number,
  clear: ChunithmClearTier,
  lampMinScore: number,
): number | null {
  const fixed = Math.round(levelValue * 10_000);
  const bonus = ORACLE_BONUS_UNITS[clear];
  const targetUnits = Math.round(targetOverPower * 30_000);
  if (oracleOverPowerUnits(levelValue, 1_010_000, clear) < targetUnits) return null;
  for (let index = 0; index < ORACLE_SEGMENTS.length; index += 1) {
    const [origin, base, step] = ORACLE_SEGMENTS[index]!;
    const end = ORACLE_SEGMENTS[index + 1]?.[0] ?? 1_010_000;
    if (oracleOverPowerUnits(levelValue, end, clear) < targetUnits) continue;
    const delta = Math.ceil((targetUnits - 15 * fixed - base - bonus) / step);
    return Math.max(lampMinScore, origin + Math.max(0, delta));
  }
  return null;
}

describe('chunithm reverse minimum score contract', () => {
  it('returns the exact minimum score when the target sits on a floating point boundary', () => {
    /** 80.558−78.5=2.058，除以 0.0015 需 1372 分，即 1008872。 */
    const result = minimumScoreForChunithmOverPower(13.7, 80.558, 'none');
    expect(result).toEqual({ status: 'reachable', score: 1_008_872, lampMinScore: 0 });
    /** 浮点误差可能将 80.558 算成 80.557999 并多报 1 分。 */
    expect(calculateChunithmOverPower(13.7, 1_008_872, 'none')).toBeGreaterThanOrEqual(80.558);
    expect(calculateChunithmOverPower(13.7, 1_008_871, 'none')).toBeLessThan(80.558);
    expect(oracleMinimumScoreForOverPower(13.7, 80.558, 'none', 0)).toBe(1_008_872);
  });

  it('agrees with the independent integer oracle and keeps the result minimal', () => {
    const levels = [12, 13, 13.7, 14, 15.5, 16];
    const clears: readonly ChunithmClearTier[] = ['ajc', 'aj', 'fc', 'none'];
    const targets = [69.751, 73.52, 75, 78.501, 79.751, 80, 80.558, 81.808, 82.183, 83.5, 83.501];
    let checked = 0;
    for (const level of levels) {
      for (const clear of clears) {
        const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[clear];
        for (const target of targets) {
          const expected = oracleMinimumScoreForOverPower(level, target, clear, lampMinScore);
          const result = minimumScoreForChunithmOverPower(level, target, clear);
          checked += 1;
          if (expected == null) {
            expect(result).toEqual({ status: 'unreachable', score: null, lampMinScore });
            continue;
          }
          expect(result).toEqual({ status: 'reachable', score: expected, lampMinScore });
          const targetUnits = Math.round(target * 30_000);
          expect(oracleOverPowerUnits(level, expected, clear)).toBeGreaterThanOrEqual(targetUnits);
          if (expected > lampMinScore) {
            expect(oracleOverPowerUnits(level, expected - 1, clear)).toBeLessThan(targetUnits);
          }
        }
      }
    }
    expect(checked).toBe(levels.length * clears.length * targets.length);
  });

  it('matches the independent oracle across every three-decimal target of a lamp range', () => {
    const levels = [13.7, 15.5];
    const clears: readonly ChunithmClearTier[] = ['ajc', 'aj', 'fc', 'none'];
    let checked = 0;
    for (const level of levels) {
      for (const clear of clears) {
        const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[clear];
        const lowest = Math.ceil(
          oracleOverPowerUnits(level, Math.max(lampMinScore, 975_000), clear) / 30,
        );
        const highest = Math.floor(oracleOverPowerUnits(level, 1_010_000, clear) / 30);
        for (let thousandth = lowest; thousandth <= highest; thousandth += 1) {
          const target = thousandth / 1000;
          const expected = oracleMinimumScoreForOverPower(level, target, clear, lampMinScore);
          expect(minimumScoreForChunithmOverPower(level, target, clear)).toEqual(
            expected == null
              ? { status: 'unreachable', score: null, lampMinScore }
              : { status: 'reachable', score: expected, lampMinScore },
          );
          checked += 1;
        }
      }
    }
    expect(checked).toBe(72_508);
  });

  it('never returns a score that the positive direction validation rejects', () => {
    expect(formulaMinimumScoreForChunithmOverPower(13.7, 80, 'ajc')).toBe(1_007_667);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_007_667, clear: 'ajc' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJC 至少需要 1,010,000 分。' }]);
    const overPower = minimumScoreForChunithmOverPower(13.7, 80, 'ajc');
    expect(overPower).toEqual({ status: 'reachable', score: 1_010_000, lampMinScore: 1_010_000 });
    expect(formulaMinimumScoreForChunithmRating(13.7, 15.0)).toBe(1_003_000);
    const rating = minimumScoreForChunithmRating(13.7, 15.0, 'ajc');
    expect(rating).toEqual({ status: 'reachable', score: 1_010_000, lampMinScore: 1_010_000 });
  });

  it('keeps every reachable reverse result acceptable for the positive direction', () => {
    const levels = [0.5, 8.25, 13.7, 16];
    const clears: readonly ChunithmClearTier[] = ['ajc', 'aj', 'fc', 'none'];
    const targets = [1, 5.5, 13.7, 15.0, 15.85, 16.15, 68.5, 73.52, 80, 83.5, 83.51, 99, 9999];
    let reachable = 0;
    for (const level of levels) {
      for (const clear of clears) {
        for (const target of targets) {
          const results = [
            minimumScoreForChunithmRating(level, target, clear),
            minimumScoreForChunithmOverPower(level, target, clear),
          ];
          for (const result of results) {
            if (result.status !== 'reachable') {
              expect(result.score).toBeNull();
              continue;
            }
            reachable += 1;
            expect(parseChunithmChartInput({
              levelValue: level,
              score: result.score!,
              clear,
            }).violations).toEqual([]);
            expect(result.score).toBeGreaterThanOrEqual(CHUNITHM_CLEAR_TIER_MIN_SCORE[clear]);
          }
        }
      }
    }
    expect(reachable).toBeGreaterThan(0);
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
    expect(CHUNITHM_CLEAR_TIER_MIN_SCORE).toEqual({ ajc: 1_010_000, aj: 1_000_000, fc: 0, none: 0 });
  });

  it('collects every in-range violation at once, ordered by level, score then lamp', () => {
    const parsed = parseChunithmChartInput({ levelValue: 99, score: 1_000, clear: 'ajc' });
    expect(parsed.violations.map((violation) => violation.code))
      .toEqual(['level_out_of_range', 'lamp_score_conflict']);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_010_001, clear: 'ajc' }).violations)
      .toEqual([{ code: 'score_out_of_range', message: '分数必须在 0 到 1,010,000 之间。' }]);
  });
});
