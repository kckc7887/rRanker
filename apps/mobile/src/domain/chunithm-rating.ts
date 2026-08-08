/**
 * 中二节奏评分公式（来源：官方公式，2025 版 OVER POWER 体系）。
 * - 单曲 Rating 分段线性；OP 在 975000 以下无定义（为 0）。
 * - 单曲 OP = 5×Rating + 灯奖励（975000~1007500）；1007500 以上改用
 *   5×(定数+2) + (分数-1007500)×0.0015 + 灯奖励，AJC 满分自然等于 5×(定数+3)。
 */

/** 分数段 → 定数加成（base，×10000）与斜率（每 1 分加成）。 */
const OP_SCALE = 10_000;
const RATING_POINTS: readonly { score: number; base: number; ratio: number }[] = [
  { score: 1_009_000, base: 21_500 /* 2.15 */, ratio: 0 },
  { score: 1_007_500, base: 20_000 /* 2.0 */, ratio: 1 },
  { score: 1_005_000, base: 15_000 /* 1.5 */, ratio: 2 },
  { score: 1_000_000, base: 10_000 /* 1.0 */, ratio: 1 },
  { score: 990_000, base: 6_000 /* 0.6 */, ratio: 0.4 },
  { score: 975_000, base: 0, ratio: 0.4 },
  { score: 900_000, base: -50_000 /* -5.0 */, ratio: 2 / 3 },
];

export type ChunithmClearTier = 'ajc' | 'aj' | 'fc' | 'none';

/** OP 灯奖励（直接实际值）：AJC 1.25 / AJ 1.0 / FC 0.5 / 无 0。 */
const CLEAR_BONUSES: Record<ChunithmClearTier, number> = {
  ajc: 1.25,
  aj: 1.0,
  fc: 0.5,
  none: 0,
};

/** 定数下限保护：中二谱面定数通常 1.0 ~ 15.5。 */
function normalizedLevelValue(levelValue: number): number {
  return Number.isFinite(levelValue) ? Math.max(0, levelValue) : 0;
}

function fixedConstant(levelValue: number): number {
  return Math.floor(normalizedLevelValue(levelValue) * OP_SCALE);
}

function rawRating(levelValue: number, score: number): number {
  const fixed = fixedConstant(levelValue);
  if (score >= 900_000) {
    const point = RATING_POINTS.find((item) => score >= item.score);
    if (!point) return 0;
    return Math.max(0, fixed + point.base + point.ratio * (score - point.score));
  }
  if (score >= 800_000) {
    return ((fixed - 50_000) / 2)
      + (((fixed - 50_000) / 2) * (score - 800_000)) / 100_000;
  }
  if (score >= 500_000) {
    return (((fixed - 50_000) / 2) * (score - 500_000)) / 300_000;
  }
  return 0;
}

/**
 * 单谱面 Rating。官方显示口径为两位小数向下取整（与落雪前端 Math.floor(rating*100)/100 一致）。
 */
export function calculateChunithmChartRating(levelValue: number, score: number): number {
  if (!Number.isFinite(levelValue) || !Number.isFinite(score) || score <= 0) return 0;
  const raw = rawRating(levelValue, score);
  return Math.max(0, Math.floor(raw / 100) / 100);
}

/**
 * 单谱面理论最高 Rating（1,009,000 分以上，AJC 或 SSS+ 满分档）。
 */
export function maxChunithmChartRating(levelValue: number): number {
  return roundToTwo(normalizedLevelValue(levelValue) + 2.15);
}

/**
 * 单谱面 OVER POWER（官方公式）。
 * - 975000 以下无定义，返回 0。
 * - 975000~1007500：5×Rating + 灯奖励。
 * - 1007500 以上：5×(定数+2) + (分数-1007500)×0.0015 + 灯奖励；
 *   AJC 满分（1010000）自然等于理论最高 5×(定数+3)。
 */
export function calculateChunithmOverPower(
  levelValue: number,
  score: number,
  clear: ChunithmClearTier,
): number {
  if (!Number.isFinite(levelValue) || !Number.isFinite(score) || score <= 0) return 0;
  const level = normalizedLevelValue(levelValue);
  const lampBonus = CLEAR_BONUSES[clear];
  if (score < 975_000) return 0;
  if (score <= 1_007_500) {
    return 5 * calculateChunithmChartRating(level, score) + lampBonus;
  }
  return 5 * (level + 2) + (score - 1_007_500) * 0.0015 + lampBonus;
}

/**
 * 单谱面理论最高 OVER POWER（1,010,000 分 AJC）。
 */
export function maxChunithmOverPower(levelValue: number): number {
  return roundToTwo((normalizedLevelValue(levelValue) + 3) * 5);
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 目标 Rating → 所需最低分数。不可达返回 null。
 */
export function minimumScoreForChunithmRating(
  levelValue: number,
  targetRating: number,
): number | null {
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetRating) || targetRating <= 0) {
    return null;
  }
  if (maxChunithmChartRating(levelValue) < targetRating) return null;
  let low = 500_000;
  let high = 1_010_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (calculateChunithmChartRating(levelValue, middle) >= targetRating) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/**
 * 目标 OVER POWER → 所需最低分数。不可达返回 null。
 */
export function minimumScoreForChunithmOverPower(
  levelValue: number,
  targetOverPower: number,
  clear: ChunithmClearTier,
): number | null {
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetOverPower) || targetOverPower <= 0) {
    return null;
  }
  if (maxChunithmOverPower(levelValue) < targetOverPower) return null;
  let low = 0;
  let high = 1_010_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (calculateChunithmOverPower(levelValue, middle, clear) >= targetOverPower) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/** 各分数档位对应的 Rating 与 OVER POWER 表（供档位表展示）。 */
export function chunithmRatingTable(
  levelValue: number,
  clear: ChunithmClearTier,
): { score: number; rating: number; overPower: number }[] {
  return [1_010_000, 1_009_000, 1_007_500, 1_005_000, 1_000_000, 990_000, 975_000, 950_000, 925_000, 900_000]
    .map((score) => ({
      score,
      rating: calculateChunithmChartRating(levelValue, score),
      overPower: calculateChunithmOverPower(levelValue, score, clear),
    }));
}