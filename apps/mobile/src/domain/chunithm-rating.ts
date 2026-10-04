/** 内部公式使用完整精度；展示 Rating 向下截到两位并限制为非负。
 * 定数按 ×10000 向下量化。OP 的 975000–1007500 分支使用完整 Rating，尚无官方样本确认截断口径。 */

/** 定数按 ×10000 记录。 */
const RATING_SCALE = 10_000;

/** ×6×10^9 可整除各分段的分母，反推用整数比较。 */
const RATING_UNITS = 6_000_000_000;

const RATING_UNIT_STEP = RATING_UNITS / RATING_SCALE;

const RATING_UNITS_PER_HUNDREDTH = RATING_UNITS / 100;

/** OP 按 ×30000 记录。 */
const OVER_POWER_UNITS = 30_000;

/** 低于 975000 分时 OP 为 0。 */
const OVER_POWER_MIN_SCORE = 975_000;

const RATING_MIN_SCORE = 500_000;

const RATING_UNITS_PER_OVER_POWER = RATING_UNITS / 150_000;

/** base 按 ×10000 记录，slopeUnits 是每分对应的定点增量。 */
const RATING_POINTS: readonly { score: number; base: number; slopeUnits: number }[] = [
  { score: 1_009_000, base: 21_500 /* 2.15 */, slopeUnits: 0 },
  { score: 1_007_500, base: 20_000 /* 2.0 */, slopeUnits: RATING_UNIT_STEP },
  { score: 1_005_000, base: 15_000 /* 1.5 */, slopeUnits: 2 * RATING_UNIT_STEP },
  { score: 1_000_000, base: 10_000 /* 1.0 */, slopeUnits: RATING_UNIT_STEP },
  { score: 990_000, base: 6_000 /* 0.6 */, slopeUnits: (2 * RATING_UNIT_STEP) / 5 },
  { score: 975_000, base: 0, slopeUnits: (2 * RATING_UNIT_STEP) / 5 },
  { score: 900_000, base: -50_000 /* -5.0 */, slopeUnits: (2 * RATING_UNIT_STEP) / 3 },
];

export type ChunithmClearTier = 'ajc' | 'aj' | 'fc' | 'none';

export const CHUNITHM_CLEAR_TIER_LABELS: Readonly<Record<ChunithmClearTier, string>> = {
  ajc: 'AJC',
  aj: 'AJ',
  fc: 'FC',
  none: '无',
};

/** AJC/AJ/FC 分别奖励 1.25/1/0.5 OP。 */
const CLEAR_BONUS_UNITS: Record<ChunithmClearTier, number> = {
  ajc: 37_500,
  aj: 30_000,
  fc: 15_000,
  none: 0,
};

export const CHUNITHM_LEVEL_VALUE_MAX = 16;
export const CHUNITHM_SCORE_MAX = 1_010_000;

/** AJC 最低 1010000，AJ 最低 1000000；这是必要条件，尚无官方样本验证。 */
export const CHUNITHM_CLEAR_TIER_MIN_SCORE: Readonly<Record<ChunithmClearTier, number>> = {
  ajc: 1_010_000,
  aj: 1_000_000,
  fc: 0,
  none: 0,
};

function normalizedLevelValue(levelValue: number): number {
  return Number.isFinite(levelValue) ? Math.max(0, levelValue) : 0;
}

function hasUsableInput(levelValue: number, score: number): boolean {
  return Number.isFinite(levelValue) && Number.isFinite(score) && score > 0;
}

function fixedConstant(levelValue: number): number {
  return Math.floor(normalizedLevelValue(levelValue) * RATING_SCALE);
}

function rawRatingUnits(levelValue: number, score: number): number {
  const fixed = fixedConstant(levelValue);
  if (score >= 900_000) {
    const point = RATING_POINTS.find((item) => score >= item.score);
    if (!point) return 0;
    /** 900000 分以上的公式自带 0 下界。 */
    return Math.max(0, (fixed + point.base) * RATING_UNIT_STEP
      + point.slopeUnits * (score - point.score));
  }
  if (score >= 800_000) {
    /** 化简后为 3×(fixed−50000)×(100000+分数差)。 */
    return 3 * (fixed - 50_000) * (score - 800_000 + 100_000);
  }
  if (score >= 500_000) {
    /** 化简后为 (fixed−50000)×分数差。 */
    return (fixed - 50_000) * (score - 500_000);
  }
  return 0;
}

export function chunithmChartRatingDisplay(levelValue: number, score: number): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  /** 在整数域截断，避免浮点误差跨越两位显示边界。 */
  return Math.max(
    0,
    Math.floor(rawRatingUnits(levelValue, score) / RATING_UNITS_PER_HUNDREDTH) / 100,
  );
}

export function maxChunithmChartRating(levelValue: number): number {
  return chunithmChartRatingDisplay(levelValue, 1_009_000);
}

/** 975000–1007500：5×raw Rating+灯奖励；更高分：5×(定数+2)+分差×0.0015+灯奖励。 */
export function calculateChunithmOverPower(
  levelValue: number,
  score: number,
  clear: ChunithmClearTier,
): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  return rawOverPowerUnits(levelValue, score, clear) / OVER_POWER_UNITS;
}

function rawOverPowerUnits(levelValue: number, score: number, clear: ChunithmClearTier): number {
  if (score < OVER_POWER_MIN_SCORE) return 0;
  const bonus = CLEAR_BONUS_UNITS[clear];
  if (score <= 1_007_500) {
    return rawRatingUnits(levelValue, score) / RATING_UNITS_PER_OVER_POWER + bonus;
  }
  /** OP 定点式：15×fixed+300000+45×分数差。 */
  return 15 * fixedConstant(levelValue) + 300_000 + 45 * (score - 1_007_500) + bonus;
}

export function maxChunithmOverPower(levelValue: number): number {
  return roundToTwo((normalizedLevelValue(levelValue) + 3) * 5);
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 只吸收十进制目标量化的浮点尾差，远小于公式最小步长。 */
const FIXED_POINT_EPSILON = 1e-6;

export type ChunithmMinimumScore = {
  status: 'reachable' | 'unreachable';
  score: number | null;
  lampMinScore: number;
};

function ratingTargetUnits(targetRating: number): number | null {
  const hundredths = Math.ceil(targetRating * 100 - FIXED_POINT_EPSILON);
  return Number.isFinite(hundredths) ? hundredths * RATING_UNITS_PER_HUNDREDTH : null;
}

function overPowerTargetUnits(targetOverPower: number): number | null {
  const units = Math.ceil(targetOverPower * OVER_POWER_UNITS - FIXED_POINT_EPSILON);
  return Number.isFinite(units) ? units : null;
}

/** 搜索区间内 Rating 与 OP 单调不减。 */
function lowestScoreMeeting(low: number, meets: (score: number) => boolean): number | null {
  if (!meets(CHUNITHM_SCORE_MAX)) return null;
  let lowBound = low;
  let highBound = CHUNITHM_SCORE_MAX;
  while (lowBound < highBound) {
    const middle = Math.floor((lowBound + highBound) / 2);
    if (meets(middle)) highBound = middle;
    else lowBound = middle + 1;
  }
  return lowBound;
}

function minimumScoreResult(
  levelValue: number,
  clear: ChunithmClearTier,
  candidate: number | null,
): ChunithmMinimumScore {
  const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[clear];
  if (candidate == null) return { status: 'unreachable', score: null, lampMinScore };
  const parsed = parseChunithmChartInput({ levelValue, score: candidate, clear });
  return parsed.violations.length === 0
    ? { status: 'reachable', score: candidate, lampMinScore }
    : { status: 'unreachable', score: null, lampMinScore };
}

/** 展示目标量化为 ceil(t×100)/100；纯公式解不考虑灯的最低分。 */
export function formulaMinimumScoreForChunithmRating(
  levelValue: number,
  targetRating: number,
): number | null {
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetRating) || targetRating <= 0) {
    return null;
  }
  const targetUnits = ratingTargetUnits(targetRating);
  if (targetUnits == null) return null;
  return lowestScoreMeeting(
    RATING_MIN_SCORE,
    (score) => rawRatingUnits(levelValue, score) >= targetUnits,
  );
}

export function minimumScoreForChunithmRating(
  levelValue: number,
  targetRating: number,
  clear: ChunithmClearTier,
): ChunithmMinimumScore {
  const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[clear];
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetRating) || targetRating <= 0) {
    return { status: 'unreachable', score: null, lampMinScore };
  }
  const targetUnits = ratingTargetUnits(targetRating);
  const candidate = targetUnits == null ? null : lowestScoreMeeting(
    Math.max(lampMinScore, RATING_MIN_SCORE),
    (score) => rawRatingUnits(levelValue, score) >= targetUnits,
  );
  return minimumScoreResult(levelValue, clear, candidate);
}

/** 纯公式解不考虑灯的最低分。 */
export function formulaMinimumScoreForChunithmOverPower(
  levelValue: number,
  targetOverPower: number,
  clear: ChunithmClearTier,
): number | null {
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetOverPower) || targetOverPower <= 0) {
    return null;
  }
  const targetUnits = overPowerTargetUnits(targetOverPower);
  if (targetUnits == null) return null;
  return lowestScoreMeeting(
    OVER_POWER_MIN_SCORE,
    (score) => rawOverPowerUnits(levelValue, score, clear) >= targetUnits,
  );
}

export function minimumScoreForChunithmOverPower(
  levelValue: number,
  targetOverPower: number,
  clear: ChunithmClearTier,
): ChunithmMinimumScore {
  const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[clear];
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetOverPower) || targetOverPower <= 0) {
    return { status: 'unreachable', score: null, lampMinScore };
  }
  const targetUnits = overPowerTargetUnits(targetOverPower);
  const candidate = targetUnits == null ? null : lowestScoreMeeting(
    Math.max(lampMinScore, OVER_POWER_MIN_SCORE),
    (score) => rawOverPowerUnits(levelValue, score, clear) >= targetUnits,
  );
  return minimumScoreResult(levelValue, clear, candidate);
}

export type ChunithmChartInputViolation = {
  code: 'level_out_of_range' | 'score_out_of_range' | 'lamp_score_conflict';
  message: string;
};

export type ChunithmChartInputParse = {
  levelValue: number;
  score: number;
  clear: ChunithmClearTier;
  lampMinScore: number;
  violations: readonly ChunithmChartInputViolation[];
};

export function parseChunithmChartInput(input: {
  levelValue: number;
  score: number;
  clear: ChunithmClearTier;
}): ChunithmChartInputParse {
  const violations: ChunithmChartInputViolation[] = [];
  const levelValue = normalizedLevelValue(input.levelValue);
  if (!Number.isFinite(input.levelValue) || input.levelValue <= 0
    || input.levelValue > CHUNITHM_LEVEL_VALUE_MAX) {
    violations.push({
      code: 'level_out_of_range',
      message: `定数必须大于 0 且不超过 ${CHUNITHM_LEVEL_VALUE_MAX}。`,
    });
  }
  const scoreOutOfRange = !Number.isFinite(input.score)
    || input.score < 0
    || input.score > CHUNITHM_SCORE_MAX;
  if (scoreOutOfRange) {
    violations.push({
      code: 'score_out_of_range',
      message: `分数必须在 0 到 ${CHUNITHM_SCORE_MAX.toLocaleString('en-US')} 之间。`,
    });
  }
  const lampMinScore = CHUNITHM_CLEAR_TIER_MIN_SCORE[input.clear];
  if (!scoreOutOfRange && input.score < lampMinScore) {
    violations.push({
      code: 'lamp_score_conflict',
      message: `${CHUNITHM_CLEAR_TIER_LABELS[input.clear]} 至少需要 ${lampMinScore.toLocaleString('en-US')} 分。`,
    });
  }
  return {
    levelValue,
    score: scoreOutOfRange ? 0 : input.score,
    clear: input.clear,
    lampMinScore,
    violations,
  };
}

/** 档位表是公式参考，所选灯在各档位未必可达。 */
export function chunithmRatingTable(
  levelValue: number,
  clear: ChunithmClearTier,
): { score: number; rating: number; overPower: number }[] {
  return [1_010_000, 1_009_000, 1_007_500, 1_005_000, 1_000_000, 990_000, 975_000, 950_000, 925_000, 900_000]
    .map((score) => ({
      score,
      rating: chunithmChartRatingDisplay(levelValue, score),
      overPower: calculateChunithmOverPower(levelValue, score, clear),
    }));
}
