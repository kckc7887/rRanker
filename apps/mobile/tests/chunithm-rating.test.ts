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
 *
 * 来源：分段公式、定点口径与 raw/display 分层取自本仓库 `src/domain/chunithm-rating.ts`
 * （该文件头部记录公式、「展示精度不得进入内部公式」的约定与待核项），展示口径对齐落雪前端的
 * `Math.floor(rating×100)/100`。仓库内没有可引用的官方手册或实测金样版本，
 * 因此本表只锁定仓库内实现口径，不标注上游版本号。
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

  it('keeps raw a mathematical intermediate and the display value floored at zero', () => {
    // 定数 1.0（fixed = 10000）、分数 850,000，800,000~900,000 段：
    // (10000-50000)/2 × (1 + 50000/100000) = -20000 × 1.5 = -30000（×10000 口径）→ raw -3
    expect(rawChunithmChartRating(1.0, 850_000)).toBeCloseTo(-3, 9);
    expect(chunithmChartRatingDisplay(1.0, 850_000)).toBe(0);
    // 500,000~800,000 段同样可能为负：(-40000/2) × 100000/300000 = -0.6666…
    expect(rawChunithmChartRating(1.0, 600_000)).toBeCloseTo(-0.6666666667, 9);
    expect(chunithmChartRatingDisplay(1.0, 600_000)).toBe(0);
    // 900,000 以上分段自带 0 下界（公式边界的一部分），两层都是 0
    expect(rawChunithmChartRating(1.0, 900_000)).toBe(0);
    expect(chunithmChartRatingDisplay(1.0, 900_000)).toBe(0);
    // 定数足够大时两层都是正数，差异只来自展示口径的下取整
    // 定数 13.7、分数 850,000 → (137000-50000)/2 × 1.5 = 65250（×10000 口径）→ 6.525 / 6.52
    expect(rawChunithmChartRating(13.7, 850_000)).toBeCloseTo(6.525, 9);
    expect(chunithmChartRatingDisplay(13.7, 850_000)).toBeCloseTo(6.52, 9);
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
    // 定数 13.7 满分为 15.85；15.00 = 14.7 + 0.3 → 1,003,000（无灯 / FC 的最低分是 0）
    const result = minimumScoreForChunithmRating(13.7, 15.0, 'none');
    expect(result).toEqual({ status: 'reachable', score: 1_003_000, lampMinScore: 0 });
    expect(chunithmChartRatingDisplay(13.7, result.score!)).toBeGreaterThanOrEqual(15.0);
    expect(chunithmChartRatingDisplay(13.7, result.score! - 1)).toBeLessThan(15.0);
    // 目标不是两位小数时按展示格点向上量化：14.999 与 15.00 同解
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
    // 1,007,500 以上改用 5×(定数+2) + (分数-1,007,500)×0.0015 + 灯奖励：
    // 78.5 + (分数-1,007,500)×0.0015 + 1.0 ≥ 80 → 需要 334 分 → 1,007,834（AJ 的最低分是 1,000,000）
    const result = minimumScoreForChunithmOverPower(13.7, 80, 'aj');
    expect(result).toEqual({ status: 'reachable', score: 1_007_834, lampMinScore: 1_000_000 });
    expect(calculateChunithmOverPower(13.7, result.score!, 'aj')).toBeGreaterThanOrEqual(80);
    expect(calculateChunithmOverPower(13.7, result.score! - 1, 'aj')).toBeLessThan(80);
    // 1,007,500 以下按 5×Rating(raw)：非 0.05 倍数的目标也取到最小分数
    // 5×(14.7 + 40/10000) = 73.52 → 1,000,040
    expect(formulaMinimumScoreForChunithmOverPower(13.7, 73.52, 'none')).toBe(1_000_040);
    expect(calculateChunithmOverPower(13.7, 1_000_039, 'none')).toBeLessThan(73.52);
    // 低于 975,000 无 OP，目标大于 0 时最低分数必在 975,000 及以上
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

/**
 * 反推的独立整数 oracle：不复用被测实现，按文件头写明的分段公式直接用整数解析反解最低分数
 * （OP × 30000 定点，灯奖励也换算到该定点）。
 * 被测实现走的是「定点函数 + 二分」，这里是「分段解析式 + 向上取整」，两条路径互相独立。
 */
const ORACLE_BONUS_UNITS: Readonly<Record<ChunithmClearTier, number>> = {
  ajc: 37_500, aj: 30_000, fc: 15_000, none: 0,
};

/** [段起点, 段内基准, 每 1 分的增量]，单位都是 OP×30000。 */
const ORACLE_SEGMENTS: readonly (readonly [origin: number, base: number, step: number])[] = [
  [975_000, 0, 6],
  [990_000, 90_000, 6],
  [1_000_000, 150_000, 15],
  [1_005_000, 225_000, 30],
  [1_007_500, 300_000, 45],
];

/** OP×30000 = 15×定数定点 + 段内基准 + 增量×分数差 + 灯奖励。 */
function oracleOverPowerUnits(
  levelValue: number,
  score: number,
  clear: ChunithmClearTier,
): number {
  if (score < 975_000) return 0;
  // 枚举用的定数（13.7、15.5 等）乘 10000 后正好是整数，取整方式不影响期望值。
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
  // 目标取三位小数时，目标×30000 是整数，舍入不会引入偏差。
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
    // 独立推算：定数 13.7 → 5×(13.7+2) = 78.5；80.558 - 78.5 = 2.058；
    // 2.058 / 0.0015 = 1,372 分（整数）→ 1,007,500 + 1,372 = 1,008,872（灯 none 无奖励）
    const result = minimumScoreForChunithmOverPower(13.7, 80.558, 'none');
    expect(result).toEqual({ status: 'reachable', score: 1_008_872, lampMinScore: 0 });
    // 浮点比较会把 1,008,872 的 OP 算成 80.557999…，据此二分就会多报 1 分（1,008,873）
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
          // 最小性：返回分数满足目标，减一不满足（判定用独立 oracle 的定点值）。
          // 返回分数等于灯的最低分时，减一已经不是该灯态的合法输入，不再要求公式不满足。
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
    // 密集枚举：按 0.001 的步长扫过每个灯态可达的整个 OP 区间，期望值全部来自独立 oracle。
    // 目标正好落在公式值上时最容易暴露浮点相等边界，这个枚举会大量命中这种目标。
    const levels = [13.7, 15.5];
    const clears: readonly ChunithmClearTier[] = ['ajc', 'aj', 'fc', 'none'];
    let checked = 0;
    for (const level of levels) {
      for (const clear of clears) {
        const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[clear];
        // oracle 的定点是 OP×30000，除以 30 得到 OP×1000（三位小数的目标格点）
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
    // 2 个定数 × 4 种灯态的整个可达区间共 72,508 个三位小数目标
    expect(checked).toBe(72_508);
  });

  it('never returns a score that the positive direction validation rejects', () => {
    // 13.7 + AJC + 目标 OP 80：公式解 1,007,667 低于 AJC 的合法下限 1,010,000
    expect(formulaMinimumScoreForChunithmOverPower(13.7, 80, 'ajc')).toBe(1_007_667);
    expect(parseChunithmChartInput({ levelValue: 13.7, score: 1_007_667, clear: 'ajc' }).violations)
      .toEqual([{ code: 'lamp_score_conflict', message: 'AJC 至少需要 1,010,000 分。' }]);
    // 合法输入集里只有 1,010,000 一个分数，它满足目标（83.50 ≥ 80），因此可达最低分就是它
    const overPower = minimumScoreForChunithmOverPower(13.7, 80, 'ajc');
    expect(overPower).toEqual({ status: 'reachable', score: 1_010_000, lampMinScore: 1_010_000 });
    // Rating 反推走同一条规则：公式解 1,003,000 同样低于 AJC 的下限
    expect(formulaMinimumScoreForChunithmRating(13.7, 15.0)).toBe(1_003_000);
    const rating = minimumScoreForChunithmRating(13.7, 15.0, 'ajc');
    expect(rating).toEqual({ status: 'reachable', score: 1_010_000, lampMinScore: 1_010_000 });
  });

  it('keeps every reachable reverse result acceptable for the positive direction', () => {
    // 「输入解析 → 反推」的组合验证：反推结果必须过正算用的同一个输入边界
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
