import {
  calculateChunithmChartRating,
  calculateChunithmOverPower,
  chunithmRatingTable,
  maxChunithmChartRating,
  maxChunithmOverPower,
  minimumScoreForChunithmOverPower,
  minimumScoreForChunithmRating,
} from '@/domain/chunithm-rating';

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
    expect(calculateChunithmChartRating(13.7, 1_009_000)).toBeCloseTo(15.85, 2);
    expect(calculateChunithmChartRating(13.7, 1_010_000)).toBeCloseTo(15.85, 2);
    expect(calculateChunithmChartRating(12.0, 1_009_000)).toBeCloseTo(14.15, 2);
  });

  it('computes mid-tier ratings with the piecewise linear formula', () => {
    // 1007500 -> +2.00
    expect(calculateChunithmChartRating(13.7, 1_007_500)).toBeCloseTo(15.7, 2);
    // 1005000 -> +1.50
    expect(calculateChunithmChartRating(13.7, 1_005_000)).toBeCloseTo(15.2, 2);
    // 1000000 -> +1.00
    expect(calculateChunithmChartRating(13.7, 1_000_000)).toBeCloseTo(14.7, 2);
    // 975000 -> +0.00
    expect(calculateChunithmChartRating(13.7, 975_000)).toBeCloseTo(13.7, 2);
    // 900000 -> -5.00
    expect(calculateChunithmChartRating(13.7, 900_000)).toBeCloseTo(8.7, 2);
  });

  it('floors the displayed rating to two decimals', () => {
    // 1000000 档斜率 1/10000：1000000 + 2500 -> 14.7 + 0.25 = 14.95
    expect(calculateChunithmChartRating(13.7, 1_002_500)).toBeCloseTo(14.95, 2);
    // 超过 14.95 的非整百值向下取整到两位小数
    expect(calculateChunithmChartRating(13.7, 1_002_501)).toBeCloseTo(14.95, 2);
  });

  it('computes over power with official lamp bonuses', () => {
    // 官方灯奖励：AJC 1.25 / AJ 1.0 / FC 0.5 / 无 0
    const ajc = calculateChunithmOverPower(13.7, 1_009_000, 'ajc');
    const aj = calculateChunithmOverPower(13.7, 1_009_000, 'aj');
    const fc = calculateChunithmOverPower(13.7, 1_009_000, 'fc');
    const none = calculateChunithmOverPower(13.7, 1_009_000, 'none');
    expect(ajc - aj).toBeCloseTo(0.25, 2);
    expect(aj - none).toBeCloseTo(1.0, 2);
    expect(fc - none).toBeCloseTo(0.5, 2);
  });

  it('computes over power with the official 1007500+ bonus', () => {
    // 1007500 以上：5×(定数+2) + (分数-1007500)×0.0015 + 灯奖励
    // 定数 13.7：5×15.7 = 78.5，1009000 加 1500×0.0015 = 2.25 → 80.75
    expect(calculateChunithmOverPower(13.7, 1_009_000, 'none')).toBeCloseTo(80.75, 2);
    // 975000~1007500：5×Rating + 灯奖励；975000 的 Rating = 定数
    expect(calculateChunithmOverPower(13.7, 975_000, 'none')).toBeCloseTo(68.5, 2);
  });

  it('returns zero over power below 975000', () => {
    expect(calculateChunithmOverPower(13.7, 960_000, 'ajc')).toBe(0);
    expect(calculateChunithmOverPower(13.7, 900_000, 'aj')).toBe(0);
    expect(calculateChunithmOverPower(13.7, 500_000, 'fc')).toBe(0);
  });

  it('caps over power at the AJC maximum for 1010000', () => {
    // 官方公式：AJC 满分 1010000 时自然等于 5×(定数+3)
    expect(calculateChunithmOverPower(13.7, 1_010_000, 'ajc'))
      .toBeCloseTo(maxChunithmOverPower(13.7), 2);
    expect(maxChunithmOverPower(13.7)).toBeCloseTo(83.5, 2);
  });

  it('returns zero for invalid inputs', () => {
    expect(calculateChunithmChartRating(13.7, 0)).toBe(0);
    expect(calculateChunithmChartRating(13.7, -1)).toBe(0);
    expect(calculateChunithmOverPower(13.7, 0, 'aj')).toBe(0);
    expect(calculateChunithmChartRating(Number.NaN, 1_000_000)).toBe(0);
  });

  it('reverses a target rating into a minimum score', () => {
    // 定数 13.7 满分为 15.85，反推 15.00 应为 1000000 档以上
    const score = minimumScoreForChunithmRating(13.7, 15.0);
    expect(score).not.toBeNull();
    expect(calculateChunithmChartRating(13.7, score!)).toBeGreaterThanOrEqual(15.0);
    if (score! > 0) {
      expect(calculateChunithmChartRating(13.7, score! - 1)).toBeLessThan(15.0);
    }
  });

  it('returns null when the target rating is unreachable', () => {
    expect(minimumScoreForChunithmRating(13.7, 999)).toBeNull();
    expect(minimumScoreForChunithmRating(13.7, 0)).toBeNull();
  });

  it('reverses a target over power into a minimum score', () => {
    const score = minimumScoreForChunithmOverPower(13.7, 80, 'aj');
    expect(score).not.toBeNull();
    expect(calculateChunithmOverPower(13.7, score!, 'aj')).toBeGreaterThanOrEqual(80);
    expect(calculateChunithmOverPower(13.7, 0, 'aj')).toBe(0);
    // 目标超过单谱面理论最高时不可达
    expect(minimumScoreForChunithmOverPower(13.7, 9999, 'aj')).toBeNull();
    // 低于 975000 无 OP，目标大于 0 时最低分数必在 975000 及以上
    const lowTarget = minimumScoreForChunithmOverPower(13.7, 1, 'none');
    expect(lowTarget).not.toBeNull();
    expect(lowTarget!).toBeGreaterThanOrEqual(975_000);
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
