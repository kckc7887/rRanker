import {
  CHUNITHM_CLEAR_TIER_MIN_SCORE,
  calculateChunithmOverPower,
  chunithmChartRatingDisplay,
  chunithmRatingTable,
  maxChunithmChartRating,
  maxChunithmOverPower,
  minimumScoreForChunithmOverPower,
  minimumScoreForChunithmRating,
  parseChunithmChartInput,
  rawChunithmChartRating,
} from '@/domain/chunithm-rating';

/**
 * 期望值全部来自手工推算的分段公式（定数 13.7 即 F = 137000，内部以 ×10000 定点计算）：
 *   分数 ≥ 1,009,000        → F + 21500
 *   分数 ≥ 1,007,500        → F + 20000 + (分数-1,007,500)×1
 *   分数 ≥ 1,005,000        → F + 15000 + (分数-1,005,000)×2
 *   分数 ≥ 1,000,000        → F + 10000 + (分数-1,000,000)×1
 *   分数 ≥ 990,000          → F + 6000  + (分数-990,000)×0.4
 *   分数 ≥ 975,000          → F       + (分数-975,000)×0.4
 *   分数 ≥ 900,000          → F - 50000 + (分数-900,000)×2/3
 *   800,000 ≤ 分数 < 900,000 → (F-50000)/2 × (1 + (分数-800,000)/100,000)
 *   500,000 ≤ 分数 < 800,000 → (F-50000)/2 × (分数-500,000)/300,000
 *   其余                     → 0
 * Rating = 上式 / 10000；展示口径再向下取整到两位小数。
 * OP：975,000 以下为 0；975,000~1,007,500 为 5×Rating(raw) + 灯奖励；
 *     1,007,500 以上为 5×(定数+2) + (分数-1,007,500)×0.0015 + 灯奖励。
 */
describe('chunithm rating formula', () => {
  it('keeps the max rating anchors consistent with the maxed test provider', () => {
    // maxed-chunithm-test-provider: maxChunithmChartRating = levelValue + 2.15
    expect(maxChunithmChartRating(13.7)).toBeCloseTo(15.85, 2);
    expect(maxChunithmChartRating(14.0)).toBeCloseTo(16.15, 2);
    expect(maxChunithmChartRating(15.5)).toBeCloseTo(17.65, 2);
  });

  it('keeps the max over power anchors consistent with the maxed test provider', () => {
    // maxed-chunithm-test-provider: maxChunithmChartOverPower = (levelValue + 3) * 5
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
    // 1,007,500 → +2.00
    expect(chunithmChartRatingDisplay(13.7, 1_007_500)).toBeCloseTo(15.7, 9);
    // 1,005,000 → +1.50
    expect(chunithmChartRatingDisplay(13.7, 1_005_000)).toBeCloseTo(15.2, 9);
    // 1,000,000 → +1.00
    expect(chunithmChartRatingDisplay(13.7, 1_000_000)).toBeCloseTo(14.7, 9);
    // 975,000 → +0.00
    expect(chunithmChartRatingDisplay(13.7, 975_000)).toBeCloseTo(13.7, 9);
    // 900,000 → -5.00
    expect(chunithmChartRatingDisplay(13.7, 900_000)).toBeCloseTo(8.7, 9);
  });

  it('floors the displayed rating to two decimals', () => {
    // 1,000,000 档斜率 1/10000：1,000,000 + 2500 → 14.7 + 0.25 = 14.95
    expect(chunithmChartRatingDisplay(13.7, 1_002_500)).toBeCloseTo(14.95, 9);
    // 超过 14.95 的非整百值向下取整到两位小数
    expect(chunithmChartRatingDisplay(13.7, 1_002_501)).toBeCloseTo(14.95, 9);
  });

  it('keeps the full-precision rating separate from the displayed rating', () => {
    // 1,000,099 = 14.7 + 99/10000 = 14.7099；展示口径截断到 14.70
    expect(rawChunithmChartRating(13.7, 1_000_099)).toBeCloseTo(14.7099, 9);
    expect(chunithmChartRatingDisplay(13.7, 1_000_099)).toBeCloseTo(14.7, 9);
    // 999,999 = 14.3 + 0.4×9999/10000 = 14.69996；展示口径截断到 14.69
    expect(rawChunithmChartRating(13.7, 999_999)).toBeCloseTo(14.69996, 9);
    expect(chunithmChartRatingDisplay(13.7, 999_999)).toBeCloseTo(14.69, 9);
    // 975,000 以下一位：8.7 + 2/3×74999/10000 = 13.699933…
    expect(rawChunithmChartRating(13.7, 974_999)).toBeCloseTo(13.6999333333, 9);
    expect(chunithmChartRatingDisplay(13.7, 974_999)).toBeCloseTo(13.69, 9);
    // 整数档位上两层相等
    expect(rawChunithmChartRating(13.7, 1_007_500)).toBe(15.7);
    expect(chunithmChartRatingDisplay(13.7, 1_007_500)).toBe(15.7);
  });

  it('computes over power from the full-precision rating inside 975000~1007500', () => {
    // 5 × 14.7099 = 73.5495；展示口径（5 × 14.70 = 73.5）是错误来源
    expect(calculateChunithmOverPower(13.7, 1_000_099, 'none')).toBeCloseTo(73.5495, 9);
    expect(calculateChunithmOverPower(13.7, 1_000_099, 'aj')).toBeCloseTo(74.5495, 9);
    expect(calculateChunithmOverPower(13.7, 1_000_099, 'ajc')).toBeCloseTo(74.7995, 9);
    // 5 × 14.69996 = 73.4998
    expect(calculateChunithmOverPower(13.7, 999_999, 'none')).toBeCloseTo(73.4998, 9);
    // 5 × 15.6998 = 78.499
    expect(calculateChunithmOverPower(13.7, 1_007_499, 'none')).toBeCloseTo(78.499, 9);
    // 5 × 15.2 = 76
    expect(calculateChunithmOverPower(13.7, 1_005_000, 'none')).toBeCloseTo(76, 9);
  });

  it('computes over power with official lamp bonuses', () => {
    // 官方灯奖励：AJC 1.25 / AJ 1.0 / FC 0.5 / 无 0
    const ajc = calculateChunithmOverPower(13.7, 1_009_000, 'ajc');
    const aj = calculateChunithmOverPower(13.7, 1_009_000, 'aj');
    const fc = calculateChunithmOverPower(13.7, 1_009_000, 'fc');
    const none = calculateChunithmOverPower(13.7, 1_009_000, 'none');
    expect(ajc - aj).toBeCloseTo(0.25, 9);
    expect(aj - none).toBeCloseTo(1.0, 9);
    expect(fc - none).toBeCloseTo(0.5, 9);
  });

  it('computes over power with the official 1007500+ bonus', () => {
    // 1,007,500 以上：5×(定数+2) + (分数-1,007,500)×0.0015 + 灯奖励
    // 定数 13.7：5×15.7 = 78.5，1,009,000 加 1500×0.0015 = 2.25 → 80.75
    expect(calculateChunithmOverPower(13.7, 1_009_000, 'none')).toBeCloseTo(80.75, 9);
    // 975,000~1,007,500：5×Rating + 灯奖励；975,000 的 Rating = 定数
    expect(calculateChunithmOverPower(13.7, 975_000, 'none')).toBeCloseTo(68.5, 9);
  });

  it('keeps over power continuous across the 1007500 branch boundary', () => {
    // 分支左侧 5×15.7 = 78.5，右侧每分 +0.0015
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
    // 5×(13.7+2) + 2500×0.0015 + 1.25 = 78.5 + 3.75 + 1.25 = 83.5 = 5×(13.7+3)
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'ajc')).toBeCloseTo(83.5, 9);
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'ajc'))
      .toBeCloseTo(maxChunithmOverPower(13.7), 9);
    expect(maxChunithmOverPower(13.7)).toBeCloseTo(83.5, 9);
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'none')).toBeCloseTo(82.25, 9);
  });

  it('matches the hand-computed table around every piecewise boundary', () => {
    const rows: readonly [score: number, raw: number, display: number, overPower: number][] = [
      // 975,000 上下
      [974_999, 13.699933333333333, 13.69, 0],
      [975_000, 13.7, 13.7, 68.5],
      [975_001, 13.70004, 13.7, 68.5002],
      // 990,000 上下
      [989_999, 14.29996, 14.29, 71.4998],
      [990_000, 14.3, 14.3, 71.5],
      [990_001, 14.30004, 14.3, 71.5002],
      // 1,000,000 上下
      [999_999, 14.69996, 14.69, 73.4998],
      [1_000_000, 14.7, 14.7, 73.5],
      [1_000_001, 14.7001, 14.7, 73.5005],
      // 1,005,000 上下
      [1_004_999, 15.1999, 15.19, 75.9995],
      [1_005_000, 15.2, 15.2, 76],
      [1_005_001, 15.2002, 15.2, 76.001],
      // 1,007,500 上下
      [1_007_499, 15.6998, 15.69, 78.499],
      [1_007_500, 15.7, 15.7, 78.5],
      [1_007_501, 15.7001, 15.7, 78.5015],
      // 1,009,000 上下
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
    // 定数 13.7 满分为 15.85；15.00 = 14.7 + 0.3 → 1,003,000
    const score = minimumScoreForChunithmRating(13.7, 15.0);
    expect(score).toBe(1_003_000);
    expect(chunithmChartRatingDisplay(13.7, score!)).toBeGreaterThanOrEqual(15.0);
    expect(chunithmChartRatingDisplay(13.7, score! - 1)).toBeLessThan(15.0);
    // 目标不是两位小数时按展示格点向上量化：14.999 与 15.00 同解
    expect(minimumScoreForChunithmRating(13.7, 14.999)).toBe(1_003_000);
    expect(minimumScoreForChunithmRating(13.7, 14.99)).toBe(1_002_900);
    expect(chunithmChartRatingDisplay(13.7, 1_002_899)).toBe(14.98);
  });

  it('returns null when the target rating is unreachable', () => {
    expect(minimumScoreForChunithmRating(13.7, 999)).toBeNull();
    expect(minimumScoreForChunithmRating(13.7, 0)).toBeNull();
    expect(minimumScoreForChunithmRating(13.7, 15.86)).toBeNull();
    expect(minimumScoreForChunithmRating(13.7, Number.NaN)).toBeNull();
  });

  it('reverses a target over power into the minimum score', () => {
    // 1,007,500 以上改用 5×(定数+2) + (分数-1,007,500)×0.0015 + 灯奖励：
    // 78.5 + (分数-1,007,500)×0.0015 + 1.0 ≥ 80 → 需要 334 分 → 1,007,834
    const score = minimumScoreForChunithmOverPower(13.7, 80, 'aj');
    expect(score).toBe(1_007_834);
    expect(calculateChunithmOverPower(13.7, score!, 'aj')).toBeGreaterThanOrEqual(80);
    expect(calculateChunithmOverPower(13.7, score! - 1, 'aj')).toBeLessThan(80);
    // 1,007,500 以下按 5×Rating(raw)：非 0.05 倍数的目标也取到最小分数
    // 5×(14.7 + 40/10000) = 73.52 → 1,000,040
    expect(minimumScoreForChunithmOverPower(13.7, 73.52, 'none')).toBe(1_000_040);
    expect(calculateChunithmOverPower(13.7, 1_000_039, 'none')).toBeLessThan(73.52);
    expect(calculateChunithmOverPower(13.7, 0, 'aj')).toBe(0);
    // 目标超过单谱面理论最高时不可达
    expect(minimumScoreForChunithmOverPower(13.7, 9999, 'aj')).toBeNull();
    expect(minimumScoreForChunithmOverPower(13.7, 83.51, 'ajc')).toBeNull();
    // 低于 975,000 无 OP，目标大于 0 时最低分数必在 975,000 及以上
    const lowTarget = minimumScoreForChunithmOverPower(13.7, 1, 'none');
    expect(lowTarget).toBe(975_000);
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
    // 归一化后的定数/分数始终是公式可用的值
    const normalized = parseChunithmChartInput({ levelValue: Number.NaN, score: 1_000_000, clear: 'none' });
    expect(normalized.levelValue).toBe(0);
  });

  it('rejects lamp and score combinations that cannot happen in game', () => {
    // AJC 只有全 CRITICAL 才成立，即 1,010,000
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_009_999, clear: 'ajc' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJC 至少需要 1,010,000 分。' }]);
    // AJ = 全部音符 JUSTICE 或更好，每个音符至少 1,000,000/物量 → 至少 1,000,000
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 999_999, clear: 'aj' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJ 至少需要 1,000,000 分。' }]);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_000_000, clear: 'aj' }).violations)
      .toEqual([]);
    // FC 与无灯不设分数下限：校验只拒绝能证明不可能的组合
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
    // 分数越界时不重复报灯的交叉约束：分数错误已经覆盖了同一个问题
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_010_001, clear: 'ajc' }).violations)
      .toEqual([{ code: 'score_out_of_range', message: '分数必须在 0 到 1,010,000 之间。' }]);
  });
});
