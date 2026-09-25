/**
 * 中二节奏单曲 Rating / OVER POWER 的数值契约。
 *
 * 精度口径（本文件最重要的约定）：
 * - raw：公式内部使用的全精度值（本文件内部以定点形式保存），后续运算不得读展示值。
 * - display：展示口径，两位小数向下取整（与落雪前端 Math.floor(rating×100)/100 一致）。
 * 两层不得互换：定数 13.7、分数 1,000,099 的 raw Rating 是 14.7099，display 是 14.70，
 * 对应 OP 分别是 73.5495 与（把展示精度送回公式才会出现的）73.50。
 * raw 是公式的数学中间值，不是「已施加领域下限的成绩」：它只在 900,000 以上的分段带上公式
 * 自有的 0 下界，低定数 + 800,000~900,000 分数时可以为负（定数 1.0、分数 850,000 → -3），
 * 施加 0 下限是 display 的职责。
 *
 * 定数精度：定数进入公式前统一按 ×10000 向下取整（`fixedConstant`），Rating 与 OP 共用这个口径。
 *
 * 公式：
 * - 分数 < 975,000 时 OP 无定义（返回 0）。
 * - 975,000 ≤ 分数 ≤ 1,007,500：OP = 5 × Rating(raw) + 灯奖励。
 * - 分数 > 1,007,500：OP = 5×(定数+2) + (分数-1,007,500)×0.0015 + 灯奖励，
 *   AJC 满分 1,010,000 自然等于 5×(定数+3)。
 *
 * 反推（目标 → 最低分数）在定点域内用整数比较，不依赖浮点相等：目标是十进制值时只向上量化到
 * 定点格点，不会因为浮点尾差（例如 1,008,872 分的 OP 被算成 80.557999…＜80.558）多报 1 分。
 *
 * 待核：975,000~1,007,500 分支里的单曲 Rating 是否需要先按展示口径截断，仓库内没有
 * 手册或实测金样可以证明。本文件按「展示精度不得进入内部公式」处理，并保留 raw/display
 * 两层；一旦拿到官方或实测样本，只需改动本文件即可切换口径。
 */

/** Rating 的基准定点口径：定数与分档加成都按 ×10000 记录。 */
const RATING_SCALE = 10_000;

/**
 * 公式内部精确运算使用的定点比例：Rating × RATING_UNITS，所有分段都落在整数上。
 *
 * 把各分段写成 ×10000 口径后，分母分别含 10000（900,000 以上）、200000（800,000~900,000）、
 * 600000（500,000~800,000），斜率的分母只有 3 与 5；取 RATING_UNITS = 6×10^9 后每一步乘积都能
 * 整除，定点值恒为整数。反推因此可以用整数比较取代浮点比较。
 */
const RATING_UNITS = 6_000_000_000;

/** ×10000 口径 → ×RATING_UNITS 口径的换算系数。 */
const RATING_UNIT_STEP = RATING_UNITS / RATING_SCALE;

/** Rating 的 1/100（展示口径的一个格点）对应的定点值。 */
const RATING_UNITS_PER_HUNDREDTH = RATING_UNITS / 100;

/** OVER POWER 的定点比例：OP × OVER_POWER_UNITS。 */
const OVER_POWER_UNITS = 30_000;

/** 低于该分数 OVER POWER 无定义（按 0 处理）。 */
const OVER_POWER_MIN_SCORE = 975_000;

/** Rating 低于该分数时恒为 0，正数目标的最小解不会落在该分数之下。 */
const RATING_MIN_SCORE = 500_000;

/** 5 × Rating 从 Rating 定点换算到 OP 定点的除数：RATING_UNITS / (5 × OVER_POWER_UNITS)。 */
const RATING_UNITS_PER_OVER_POWER = RATING_UNITS / 150_000;

/** 分数段 → 定数加成（base，×10000）与斜率（每 1 分的精确加成，×RATING_UNITS）。 */
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

/** OP 灯奖励（×OVER_POWER_UNITS）：AJC 1.25 / AJ 1.0 / FC 0.5 / 无 0。 */
const CLEAR_BONUS_UNITS: Record<ChunithmClearTier, number> = {
  ajc: 37_500,
  aj: 30_000,
  fc: 15_000,
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

/**
 * 单曲 Rating 的精确值（Rating × RATING_UNITS），全程整数运算。
 * 这是 Rating / OP / 反推共用的唯一分段实现，浮点只出现在最后一步换算。
 */
function rawRatingUnits(levelValue: number, score: number): number {
  const fixed = fixedConstant(levelValue);
  if (score >= 900_000) {
    const point = RATING_POINTS.find((item) => score >= item.score);
    if (!point) return 0;
    // 900,000 以上：Rating = (定数 + 加成 + 斜率×分数差) / 10000，该分段的公式自带 0 下界。
    return Math.max(0, (fixed + point.base) * RATING_UNIT_STEP
      + point.slopeUnits * (score - point.score));
  }
  if (score >= 800_000) {
    // (fixed-50000)/2 × (1 + 分数差/100000) ÷ 10000 × RATING_UNITS = 3×(fixed-50000)×(100000+分数差)
    return 3 * (fixed - 50_000) * (score - 800_000 + 100_000);
  }
  if (score >= 500_000) {
    // ((fixed-50000)/2) × 分数差/300000 ÷ 10000 × RATING_UNITS = (fixed-50000)×分数差
    return (fixed - 50_000) * (score - 500_000);
  }
  return 0;
}

/**
 * 单曲 Rating 的全精度值（raw）。内部公式（OP、反推最低分数）只允许读这个值。
 *
 * raw 表示公式的数学中间值，不额外施加「成绩不可能低于 0」的领域下限：低定数配
 * 800,000~900,000 分数时可能为负（定数 1.0、分数 850,000 → -3）。展示口径
 * chunithmChartRatingDisplay 才把结果截到 0，两层语义不得互换。
 * 非法输入（非有限值、分数 ≤ 0）返回 0，与「公式值恰好为 0」不可区分。
 */
export function rawChunithmChartRating(levelValue: number, score: number): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  return rawRatingUnits(levelValue, score) / RATING_UNITS;
}

/**
 * 单曲 Rating 的展示值（display）。官方显示口径为两位小数向下取整
 * （与落雪前端 Math.floor(rating×100)/100 一致），并对负值施加 0 下限。
 */
export function chunithmChartRatingDisplay(levelValue: number, score: number): number {
  if (!hasUsableInput(levelValue, score)) return 0;
  // 在定点域内取整：units / (RATING_UNITS/100) 即 Rating×100，避免浮点乘法影响下取整边界。
  return Math.max(
    0,
    Math.floor(rawRatingUnits(levelValue, score) / RATING_UNITS_PER_HUNDREDTH) / 100,
  );
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
  return rawOverPowerUnits(levelValue, score, clear) / OVER_POWER_UNITS;
}

/**
 * 与 calculateChunithmOverPower 同一个公式的定点值（OP × OVER_POWER_UNITS），恒为整数。
 * 反推最低分数只读这个值，比较不做浮点容差。
 */
function rawOverPowerUnits(levelValue: number, score: number, clear: ChunithmClearTier): number {
  if (score < OVER_POWER_MIN_SCORE) return 0;
  const bonus = CLEAR_BONUS_UNITS[clear];
  if (score <= 1_007_500) {
    // 5 × Rating × 30000 = Rating × RATING_UNITS ÷ (RATING_UNITS/150000)
    return rawRatingUnits(levelValue, score) / RATING_UNITS_PER_OVER_POWER + bonus;
  }
  // 5×(定数+2)×30000 = 150000×定数 + 300000 = 15×fixed + 300000；(分数-1007500)×0.0015×30000 = 45×分数差
  return 15 * fixedConstant(levelValue) + 300_000 + 45 * (score - 1_007_500) + bonus;
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
 * 定点域内的比较容差：只用于吸收「十进制目标 × 定点比例」这一步的浮点尾差
 * （例如 80.558×30000 在浮点下是 2416740.0000000005）。
 * 它比公式能分辨的最小步长小 6 个数量级（OP 最小步长 0.0002 = 6 个定点单位），
 * 因此不会把不满足目标的分数判成满足。
 */
const FIXED_POINT_EPSILON = 1e-6;

/**
 * 反推结果：该定数与灯态下，合法输入集里是否存在满足目标的分数。
 * - reachable：`score` 是合法分数集内的最低分，必然通过 parseChunithmChartInput。
 * - unreachable：不存在这样的分数；`score` 为 null，调用方应展示这个状态而不是公式值。
 */
export type ChunithmMinimumScore = {
  status: 'reachable' | 'unreachable';
  score: number | null;
  /** 该灯态的最低合法分数，也是反推搜索的起点。 */
  lampMinScore: number;
};

/** 目标展示 Rating 的定点阈值（Rating × RATING_UNITS）。 */
function ratingTargetUnits(targetRating: number): number | null {
  const hundredths = Math.ceil(targetRating * 100 - FIXED_POINT_EPSILON);
  return Number.isFinite(hundredths) ? hundredths * RATING_UNITS_PER_HUNDREDTH : null;
}

/** 目标 OVER POWER 的定点阈值（OP × OVER_POWER_UNITS）。 */
function overPowerTargetUnits(targetOverPower: number): number | null {
  const units = Math.ceil(targetOverPower * OVER_POWER_UNITS - FIXED_POINT_EPSILON);
  return Number.isFinite(units) ? units : null;
}

/**
 * 在 [low, CHUNITHM_SCORE_MAX] 内找最小的满足 meets 的分数。
 * 单调性是调用方公式的性质：975,000 以上的 OP 与 500,000 以上的 Rating 都不减。
 */
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

/**
 * 把候选分数包装成对外结果，并用正算的同一个输入边界复核：只有 violations 为空的分数
 * 才会作为 reachable 返回。定数越界、分数越界或灯与分数冲突的候选一律按不可达处理，
 * 保证「反推给出的最低分数」一定能被正算接受。
 */
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

/**
 * 目标 Rating → 最低分数的**纯公式解**（不考虑灯与分数的合法性），不可达返回 null。
 *
 * 返回的分数只保证满足公式，不保证是该灯态下能出现的输入：例如定数 13.7、目标 Rating 15.00
 * 会得到 1,003,000，但 AJC 只可能出现在 1,010,000。需要用户能实际使用的答案时用
 * minimumScoreForChunithmRating。
 *
 * 目标 Rating 是展示量：先量化到两位小数格点，再与全精度 Rating 比较。
 * 两者等价：floor(raw×100)/100 ≥ t ⟺ raw ≥ ceil(t×100)/100。
 */
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

/**
 * 目标 Rating → 该灯态合法输入集内的最低分数。
 *
 * Rating 与灯无关，但返回的分数必须能作为该灯态的输入（AJC 只有 1,010,000），
 * 因此搜索从该灯的最低分开始，结果必然满足 parseChunithmChartInput。
 */
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

/**
 * 目标 OVER POWER → 最低分数的**纯公式解**（不考虑灯与分数的合法性），不可达返回 null。
 *
 * 返回的分数只保证满足公式，不保证是该灯态下能出现的输入：例如定数 13.7、AJC、目标 OP 80
 * 会得到 1,007,667，而 AJC 只可能出现在 1,010,000。需要用户能实际使用的答案时用
 * minimumScoreForChunithmOverPower。
 *
 * OP 在分数上单调不减：975,000 以下恒为 0；975,000~1,007,500 段是 5×Rating(raw)；
 * 1,007,500 以上段斜率 0.0015，且在分支点与左段连续。因此二分的结果天然是最小值。
 */
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

/**
 * 目标 OVER POWER → 该灯态合法输入集内的最低分数。
 *
 * 搜索下界取 max(灯最低分, 975,000)：OP 在 975,000 以下恒为 0，目标为正数时有效下界是
 * 975,000；AJ / AJC 这类更低分数不可能出现的灯则从各自的最低分起。结果必然满足
 * parseChunithmChartInput；不可达时返回 unreachable，而不是把公式解当成可达分数。
 */
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
