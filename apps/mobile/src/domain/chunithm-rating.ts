/**
 * 中二节奏评分公式（来源：refer/chuni-tools 的 calcRawRating/calcOp，已与
 * maxed-chunithm-test-provider 的锚点 levelValue+2.15 / (levelValue+3)*5 相互验证）。
 * 内部统一放大 10000 倍避免小数运算误差（同 chuni-tools 的 opScale）。
 */

const OP_SCALE = 10_000;

/** 分数段 → 定数加成（base，×10000）与斜率（每 1 分加成）。 */
const RATING_POINTS: readonly { score: number; base: number; ratio: number }[] = [
  { score: 1_009_000, base: 21_500 /* 2.15 */, ratio: 0 },
  { score: 1_007_500, base: 20_000 /* 2.0 */, ratio: 1 },
  { score: 1_005_000, base: 15_000 /* 1.5 */, ratio: 2 },
  { score: 1_000_000, base: 10_000 /* 1.0 */, ratio: 1 },
  { score: 975_000, base: 0, ratio: 0.4 },
  { score: 900_000, base: -50_000 /* -5.0 */, ratio: 2 / 3 },
];

export type ChunithmClearTier = 'aj' | 'fc' | 'none';

const CLEAR_BONUSES: Record<ChunithmClearTier, number> = {
  aj: 2_000 /* 0.2 */,
  fc: 1_000 /* 0.1 */,
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
 * 单谱面 OVER POWER。CLEAR 加成：AJ（ALL JUSTICE 系）0.2，FC 0.1，其余无。
 * 1,010,000 分（AJC）时直接取理论最高 (定数+3)*5。
 */
export function calculateChunithmOverPower(
  levelValue: number,
  score: number,
  clear: ChunithmClearTier,
): number {
  if (!Number.isFinite(levelValue) || !Number.isFinite(score) || score <= 0) return 0;
  if (score >= 1_010_000) return maxChunithmOverPower(levelValue);
  const fixed = fixedConstant(levelValue);
  const bonus = CLEAR_BONUSES[clear];
  let rating = score < 1_007_500
    ? rawRating(levelValue, score)
    : fixed + 20_000 + 3 * (score - 1_007_500);
  rating = score >= 975_000
    ? Math.floor(rating / 10) * 10
    : Math.floor(rating / 100) * 100;
  return Math.max(0, ((rating + bonus) * 5) / OP_SCALE);
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