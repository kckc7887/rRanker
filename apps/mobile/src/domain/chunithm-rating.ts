/**
 * 中二节奏单曲 Rating / OVER POWER 的数值契约。
 *
 * 精度口径（本文件最重要的约定）：
 * - raw：公式内部使用的全精度值，任何后续运算只允许读 raw。
 * - display：展示口径，两位小数向下取整（与落雪前端 Math.floor(rating×100)/100 一致）。
 * 两层不得互换：定数 13.7、分数 1,000,099 的 raw Rating 是 14.7099，display 是 14.70，
 * 对应 OP 分别是 73.5495 与（把展示精度送回公式才会出现的）73.50。
 *
 * 公式：
 * - 分数 < 975,000 时 OP 无定义（返回 0）。
 * - 975,000 ≤ 分数 ≤ 1,007,500：OP = 5 × Rating(raw) + 灯奖励。
 * - 分数 > 1,007,500：OP = 5×(定数+2) + (分数-1,007,500)×0.0015 + 灯奖励，
 *   AJC 满分 1,010,000 自然等于 5×(定数+3)。
 *
 * 待核：975,000~1,007,500 分支里的单曲 Rating 是否需要先按展示口径截断，仓库内没有
 * 手册或实测金样可以证明。本文件按「展示精度不得进入内部公式」处理，并保留 raw/display
 * 两层；一旦拿到官方或实测样本，只需改动本文件即可切换口径。
 */

/** Rating 的内部定点比例：Rating×10000 后按整数运算，避免小数累积误差。 */
const RATING_SCALE = 10_000;

/** 分数段 → 定数加成（base，×10000）与斜率（每 1 分加成）。 */
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

export const CHUNITHM_CLEAR_TIER_LABELS: Readonly<Record<ChunithmClearTier, string>> = {
  ajc: 'AJC',
  aj: 'AJ',
  fc: 'FC',
  none: '无',
};

/** OP 灯奖励（直接实际值）：AJC 1.25 / AJ 1.0 / FC 0.5 / 无 0。 */
const CLEAR_BONUSES: Record<ChunithmClearTier, number> = {
  ajc: 1.25,
  aj: 1.0,
  fc: 0.5,
  none: 0,
};

/** 定数范围：中二谱面定数通常 1.0~15.5，边界放宽到 16 以容纳越界数据。 */
export const CHUNITHM_LEVEL_VALUE_MAX = 16;
/** 单谱面分数上限：全 CRITICAL 的 1,010,000。 */
export const CHUNITHM_SCORE_MAX = 1_010_000;

/**
 * 灯等级 → 该灯下**有可能出现**的最低分数。
 *
 * 推算（每个音符满值 = 1,010,000/物量，JUSTICE 记 1,000,000/物量）：
 * - 单谱面分数上限就是 1,010,000，只有全 CRITICAL 才能达到，而 AJC 即全 CRITICAL，
 *   因此低于 1,010,000 的 AJC 组合不可能出现。
 * - AJ 要求全部音符为 JUSTICE 或更好（没有 ATTACK / MISS），每个音符至少记
 *   1,000,000/物量，因此分数至少是 1,000,000。
 * - FC 与无灯不设分数下限：FC 的最低分数取决于 ATTACK 的记分值，仓库内没有可核对的
 *   依据，校验只拒绝能够证明不可能的组合，避免误杀合法输入。
 *
 * 这里是**必要条件**而不是充分条件：分数 1,000,000 不保证是 AJ（出现 ATTACK 时同样
 * 可能达到），AJ 也不要求分数达到 1,009,000（1,009,000 是 SSS+ 档位线，与灯无关）。
 *
 * 待核：记分值来自通用的中二记分模型推算，仓库内没有官方手册或实测金样；拿到依据后
 * 应重新核对本表，尤其是 AJ 与 FC 的下限。
 */
export const CHUNITHM_CLEAR_TIER_MIN_SCORE: Readonly<Record<ChunithmClearTier, number>> = {
  ajc: 1_010_000,
  aj: 1_000_000,
  fc: 0,
  none: 0,
};

/** 定数下限保护：中二谱面定数通常 1.0 ~ 15.5。 */
function normalizedLevelValue(levelValue: number): number {
  return Number.isFinite(levelValue) ? Math.max(0, levelValue) : 0;
}

/** 进入公式的输入必须是非负有限定数与非负有限分数。 */
function hasUsableInput(levelValue: number, score: number): boolean {
  return Number.isFinite(levelValue) && Number.isFinite(score) && score > 0;
}

function fixedConstant(levelValue: number): number {
  return Math.floor(normalizedLevelValue(levelValue) * RATING_SCALE);
}

/** 单曲 Rating 的全精度定点值（Rating×10000）。只允许在公式内部使用。 */
function rawRatingScaled(levelValue: number, score: number): number {
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
 * 单曲 Rating 的全精度值（raw）。内部公式（OP、反推最低分数）只允许读这个值。
 * 非法输入（非有限值、分数 ≤ 0）返回 0。
 */
export function rawChunithmChartRating(levelValue: number, score: number): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  return rawRatingScaled(levelValue, score) / RATING_SCALE;
}

/**
 * 单曲 Rating 的展示值（display）。官方显示口径为两位小数向下取整
 * （与落雪前端 Math.floor(rating×100)/100 一致）。
 */
export function chunithmChartRatingDisplay(levelValue: number, score: number): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  // 在定点域内取整：rawRatingScaled/100 即 Rating×100，避免浮点乘法影响下取整边界。
  return Math.max(0, Math.floor(rawRatingScaled(levelValue, score) / 100) / 100);
}

/**
 * 单曲理论最高 Rating（1,009,000 分以上，AJC 或 SSS+ 满分档）。展示口径。
 */
export function maxChunithmChartRating(levelValue: number): number {
  return roundToTwo(normalizedLevelValue(levelValue) + 2.15);
}

/**
 * 单曲 OVER POWER（全精度，未按展示口径截断）。
 * - 975000 以下无定义，返回 0。
 * - 975000~1007500：5×Rating(raw) + 灯奖励；使用全精度 Rating，不用展示值。
 * - 1007500 以上：5×(定数+2) + (分数-1007500)×0.0015 + 灯奖励；
 *   AJC 满分（1010000）自然等于理论最高 5×(定数+3)。
 * 灯的合法性与分数的交叉约束由 parseChunithmChartInput 在领域边界处理，本函数只算公式值。
 */
export function calculateChunithmOverPower(
  levelValue: number,
  score: number,
  clear: ChunithmClearTier,
): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  const lampBonus = CLEAR_BONUSES[clear];
  if (score < 975_000) return 0;
  if (score <= 1_007_500) {
    return (5 * rawRatingScaled(levelValue, score)) / RATING_SCALE + lampBonus;
  }
  const level = normalizedLevelValue(levelValue);
  return 5 * (level + 2) + (score - 1_007_500) * 0.0015 + lampBonus;
}

/**
 * 单曲理论最高 OVER POWER（1,010,000 分 AJC）。
 */
export function maxChunithmOverPower(levelValue: number): number {
  return roundToTwo((normalizedLevelValue(levelValue) + 3) * 5);
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 目标 Rating → 所需最低分数。不可达返回 null。
 *
 * 目标 Rating 是展示量：先量化到两位小数格点，再与全精度 Rating 比较。
 * 两者等价：floor(raw×100)/100 ≥ t ⟺ raw ≥ ceil(t×100)/100。
 */
export function minimumScoreForChunithmRating(
  levelValue: number,
  targetRating: number,
): number | null {
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetRating) || targetRating <= 0) {
    return null;
  }
  const threshold = Math.ceil(targetRating * 100 - 1e-9) / 100;
  const maxRaw = normalizedLevelValue(levelValue) + 2.15;
  if (maxRaw + 1e-9 < threshold) return null;
  // 500,000 以下 Rating 恒为 0，目标为正数时最小值不会落在该区间。
  let low = 500_000;
  let high = 1_010_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rawChunithmChartRating(levelValue, middle) + 1e-9 >= threshold) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

/**
 * 目标 OVER POWER → 所需最低分数。不可达返回 null。
 *
 * OP 在分数上单调不减：975,000 以下恒为 0；975,000~1,007,500 段是 5×Rating(raw)；
 * 1,007,500 以上段斜率 0.0015，且在分支点与左段连续。因此二分的结果天然是最小值。
 * 灯奖励只作为公式内的常数偏移：灯与分数的合法性由 parseChunithmChartInput 判定，
 * 不并入反推，否则「AJC + 较低目标」会被强行抬到 1,010,000。
 */
export function minimumScoreForChunithmOverPower(
  levelValue: number,
  targetOverPower: number,
  clear: ChunithmClearTier,
): number | null {
  if (!Number.isFinite(levelValue) || !Number.isFinite(targetOverPower) || targetOverPower <= 0) {
    return null;
  }
  const maxScore = 1_010_000;
  if (calculateChunithmOverPower(levelValue, maxScore, clear) < targetOverPower) return null;
  let low = 975_000;
  let high = maxScore;
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

/** 输入违规项：领域侧给出稳定 code，UI 只负责展示 message。 */
export type ChunithmChartInputViolation = {
  code: 'level_out_of_range' | 'score_out_of_range' | 'lamp_score_conflict';
  message: string;
};

export type ChunithmChartInputParse = {
  /** 公式可直接使用的定数（非法输入归一化为 0）。 */
  levelValue: number;
  /** 公式可直接使用的分数（非法输入归一化为 0）。 */
  score: number;
  clear: ChunithmClearTier;
  /** 该灯下可能出现的最低分数。 */
  lampMinScore: number;
  /** 全部违规项，按定数 → 分数 → 灯的顺序排列；空数组即组合合法。 */
  violations: readonly ChunithmChartInputViolation[];
};

/**
 * 单曲输入的领域边界：定数范围、分数范围、灯等级与分数的交叉约束都在这里判定。
 *
 * 行为约定（不抛异常）：返回 violations；调用方在 violations 非空时不得把 levelValue/score
 * 送进 Rating / OP 公式。分数越界时不再重复报灯的交叉约束（同一个问题只报一次）。
 */
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

/**
 * 各分数档位对应的 Rating 与 OVER POWER 表（供档位表展示）。
 *
 * 这是按所选灯奖励给出的公式参考表，不逐档断言「该灯 + 该分数」是合法组合；
 * 合法性只由 parseChunithmChartInput 对用户实际输入判定。
 */
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
