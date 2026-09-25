import {
  calculateRks,
  collectScoredEntries,
  isAcc100Percent,
  PHIGROS_MAX_SCORE,
  phigrosEntryToScoreRecord,
  roundRks,
  type PhigrosDifficultyTable,
  type PhigrosLevel,
  type PhigrosScoreEntry,
} from '@/domain/phigros';
import type { ScoreRecord } from '@/domain/models';

export type PushExactTarget = {
  /** 游戏内两位四舍五入显示分 */
  displayRks: number;
  /** 达成显示目标所需的精确最低 RKS */
  exactTarget: number;
  /** 加值后的期望显示分 */
  displayTarget: number;
};

export type PushRecommendation = {
  songId: string;
  level: PhigrosLevel;
  difficulty: number;
  currentAcc: number;
  targetAcc: number;
  accDiff: number;
  currentChartRks: number;
  expectedChartRks: number;
  isInBest27: boolean;
  /** 在同一组 Best27/Phi3 里，该曲达到目标 Acc 后的边际 RKS 增益。 */
  rksGain: number;
  maxPossibleGain: number;
  /** 用于卡片展示的成绩记录（当前成绩；未打谱面 score=0） */
  record: ScoreRecord;
};

export type PushRecommendationsResult = {
  currentRks: number;
  displayRks: number;
  exactTarget: number;
  displayTarget: number;
  /** 愿意投入的谱面数；预算按谱面计，同一首歌的不同难度各算一张。 */
  chartCost: number;
  /** 精确总加值（exactTarget - currentRks） */
  gainNeeded: number;
  /** 每张谱面需承担的总 RKS 份额（gainNeeded / chartCost） */
  perChartShare: number;
  /** 是否包含目标 Acc 为 100%（φ）的谱面 */
  includePhi: boolean;
  /**
   * verified：plan 已取整并重新核算，精确 RKS 达到目标。
   * not_found：搜索预算内没有找到方案，不能据此断定无解。
   * unreachable：上界证明在 φ 约束和成本谱面数内无法达到。
   */
  searchStatus: PushSearchStatus;
  /** 与 searchStatus === 'verified' 相同。 */
  combinationReachesTarget: boolean;
  /** 已验证方案，长度不超过 chartCost。页面只能对这组作达标保证。 */
  plan: PushRecommendation[];
  /**
   * 可替换 plan 中 Acc 差值最大的一张（Acc 差值相同则取定数更高者）。
   * 替换后重新核算仍达标。不进入 plan，也不能与 plan 混排后宣称前 N 张达标。
   */
  alternatives: PushRecommendation[];
  /** 与 plan 相同。 */
  recommendations: PushRecommendation[];
};

export type PushSearchStatus = 'verified' | 'not_found' | 'unreachable';

/** 推分参数的合法范围：页面与领域入口共用的唯一来源。 */
export const PHIGROS_PUSH_LIMITS = Object.freeze({
  /** 期望加值下限；更小的加值不会改变游戏内两位显示分 */
  minDelta: 0.01,
  /** 期望加值保留的小数位（超出部分四舍五入） */
  deltaDecimals: 2,
  /** 愿意投入的谱面数下限 */
  minChartCost: 1,
  /** 愿意投入的谱面数上限 */
  maxChartCost: 30,
});

const PUSH_DELTA_SCALE = 10 ** PHIGROS_PUSH_LIMITS.deltaDecimals;

/** 推分参数非法时抛出；code 稳定，供调用方与测试判定，不依赖文案。 */
export type PhigrosPushInputErrorCode = 'delta_out_of_range' | 'chart_cost_out_of_range';

export class PhigrosPushInputError extends Error {
  readonly code: PhigrosPushInputErrorCode;

  constructor(code: PhigrosPushInputErrorCode, message: string) {
    super(message);
    this.name = 'PhigrosPushInputError';
    this.code = code;
  }
}

/**
 * 期望加值解析：NaN、Infinity、小于下限都返回 null；其余四舍五入到两位小数。
 * 页面输入框与领域入口都经这里，避免两处各维护一份范围。
 */
export function parsePhigrosPushDelta(value: number): number | null {
  if (!Number.isFinite(value) || value < PHIGROS_PUSH_LIMITS.minDelta) return null;
  const rounded = Math.round(value * PUSH_DELTA_SCALE) / PUSH_DELTA_SCALE;
  return rounded < PHIGROS_PUSH_LIMITS.minDelta ? null : rounded;
}

/** 成本谱面数解析：非整数、NaN、Infinity 与超出 1–30 都返回 null。 */
export function parsePhigrosPushChartCost(value: number): number | null {
  return Number.isInteger(value)
    && value >= PHIGROS_PUSH_LIMITS.minChartCost
    && value <= PHIGROS_PUSH_LIMITS.maxChartCost
    ? value
    : null;
}

export type PhigrosPushRequest = {
  delta: number;
  chartCost: number;
  includePhi: boolean;
  searchPoolLimit?: number;
  signal?: AbortSignal;
};

/**
 * 推分请求参数解析与校验的唯一入口：页面与领域入口都从这里取值。
 * 非法输入抛出带 code 的 PhigrosPushInputError，不进入搜索，也不会被编码成
 * unreachable / verified 之类的业务结论。
 */
export function resolvePhigrosPushRequest(request: {
  delta: number;
  chartCost: number;
  includePhi?: boolean;
  searchPoolLimit?: number;
  signal?: AbortSignal;
}): PhigrosPushRequest {
  const delta = parsePhigrosPushDelta(request.delta);
  if (delta == null) {
    throw new PhigrosPushInputError(
      'delta_out_of_range',
      `加值至少为 ${PHIGROS_PUSH_LIMITS.minDelta}，且最多两位小数。`,
    );
  }
  const chartCost = parsePhigrosPushChartCost(request.chartCost);
  if (chartCost == null) {
    throw new PhigrosPushInputError(
      'chart_cost_out_of_range',
      `成本须为 ${PHIGROS_PUSH_LIMITS.minChartCost}–${PHIGROS_PUSH_LIMITS.maxChartCost} 的整数（愿意打几张谱面）。`,
    );
  }
  return {
    delta,
    chartCost,
    includePhi: request.includePhi !== false,
    searchPoolLimit: request.searchPoolLimit,
    signal: request.signal,
  };
}

type SimRecord = {
  songId: string;
  level: PhigrosLevel;
  rks: number;
  difficulty: number;
  isPhi: boolean;
};

/** 搜索过程中让出主线程的时间片。单次计算超过该值才让出，避免小规模搜索被拆散。 */
const PUSH_YIELD_INTERVAL_MS = 16;

type PushSearchControl = {
  signal?: AbortSignal;
  lastYield: number;
};

async function yieldPushSearch(control: PushSearchControl): Promise<void> {
  if (control.signal?.aborted) throw control.signal.reason ?? new Error('推分搜索已取消');
  const now = Date.now();
  if (now - control.lastYield < PUSH_YIELD_INTERVAL_MS) return;
  control.lastYield = now;
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  if (control.signal?.aborted) throw control.signal.reason ?? new Error('推分搜索已取消');
}

/** 游戏内两位小数四舍五入 → 精确推分目标 */
export function resolvePushExactTarget(currentRks: number, delta: number): PushExactTarget {
  const displayRks = Math.round(currentRks * 100) / 100;
  return {
    displayRks,
    exactTarget: displayRks + delta - 0.005,
    displayTarget: displayRks + delta,
  };
}

function toSimRecords(entries: PhigrosScoreEntry[]): SimRecord[] {
  return entries.map((e) => ({
    songId: e.songId,
    level: e.level,
    rks: e.rks,
    difficulty: e.difficulty,
    isPhi: e.score === PHIGROS_MAX_SCORE || isAcc100Percent(e.rawAcc),
  }));
}

function calculateFinalRks(records: SimRecord[]): number {
  const sorted = [...records].sort((a, b) => b.rks - a.rks);
  const best27Sum = sorted.slice(0, 27).reduce((sum, r) => sum + r.rks, 0);
  const phiSum = [...records]
    .filter((r) => r.isPhi)
    .sort((a, b) => b.difficulty - a.difficulty)
    .slice(0, 3)
    .reduce((sum, r) => sum + r.difficulty, 0);
  return (best27Sum + phiSum) / 30;
}

function withReplacedChart(
  base: SimRecord[],
  songId: string,
  level: PhigrosLevel,
  replacement: Omit<SimRecord, 'songId' | 'level'>,
): SimRecord[] {
  let found = false;
  const next: SimRecord[] = base.map((r) => {
    if (r.songId === songId && r.level === level) {
      found = true;
      return { songId, level, ...replacement };
    }
    return r;
  });
  if (!found) next.push({ songId, level, ...replacement });
  return next;
}

function roundAcc(value: number): number {
  return Math.round(value * 100) / 100;
}

function replacedSims(
  base: SimRecord[],
  songId: string,
  level: PhigrosLevel,
  difficulty: number,
  acc: number,
): SimRecord[] {
  return withReplacedChart(base, songId, level, {
    rks: calculateRks(difficulty, acc),
    difficulty,
    isPhi: isAcc100Percent(acc),
  });
}

/** 在当前模拟上，把一张谱面抬到刚好达到 goalRks 的最小两位 Acc。已达标或必须 φ 且不允许时返回 null。 */
async function minimumPushAcc(
  sims: SimRecord[],
  songId: string,
  level: PhigrosLevel,
  difficulty: number,
  currentAcc: number,
  goalRks: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<number | null> {
  await yieldPushSearch(control);
  const at = (acc: number) => calculateFinalRks(replacedSims(sims, songId, level, difficulty, acc));
  if (at(currentAcc) + 1e-9 >= goalRks) return null;
  if (at(100) + 1e-9 < goalRks) return null;
  let low = Math.max(currentAcc, 55.01);
  let high = 100;
  let target: number | null = null;
  for (let iter = 0; iter < 24; iter += 1) {
    const mid = (low + high) / 2;
    if (at(mid) + 1e-9 >= goalRks) {
      target = mid;
      high = mid;
    } else {
      low = mid;
    }
  }
  if (target == null) return null;
  let snapped = Math.ceil(target * 100 - 1e-9) / 100;
  if (snapped > 100) snapped = 100;
  if (at(snapped) + 1e-9 < goalRks) snapped = Math.min(100, Math.round((snapped + 0.01) * 100) / 100);
  if (at(snapped) + 1e-9 < goalRks) return null;
  if (!allowPhi && isAcc100Percent(snapped)) return null;
  if (snapped <= currentAcc + 1e-9) return null;
  return snapped;
}

function marginalGain(
  sims: SimRecord[],
  songId: string,
  level: PhigrosLevel,
  difficulty: number,
  acc: number,
): number {
  const before = calculateFinalRks(sims);
  const after = calculateFinalRks(replacedSims(sims, songId, level, difficulty, acc));
  return roundRks(after - before);
}

const PUSH_POOL_LIMIT = 48;
const PUSH_ALTERNATIVE_LIMIT = 64;
const PUSH_ENUM_LIMIT = 4_000;
const PUSH_NODE_BUDGET = 4_000;
const PUSH_BEAM_WIDTH = 32;
const ACC_WITHOUT_PHI = 99.99;

type PushChart = {
  key: string;
  songId: string;
  level: PhigrosLevel;
  difficulty: number;
  currentAcc: number;
  currentChartRks: number;
  isInBest27: boolean;
  maxGainRaw: number;
  scoredEntry: PhigrosScoreEntry;
};

type PushTarget = { chart: PushChart; targetAcc: number };

type DisplayedPush = {
  songId: string;
  level: PhigrosLevel;
  difficulty: number;
  targetAcc: number;
};

function maxAllowedAcc(allowPhi: boolean): number {
  return allowPhi ? 100 : ACC_WITHOUT_PHI;
}

function verifyDisplayed(base: SimRecord[], items: readonly DisplayedPush[], exactTarget: number): boolean {
  let sims = base;
  for (const item of items) {
    sims = replacedSims(sims, item.songId, item.level, item.difficulty, item.targetAcc);
  }
  return calculateFinalRks(sims) + 1e-9 >= exactTarget;
}

function reachesAtMax(
  base: SimRecord[],
  charts: readonly PushChart[],
  allowPhi: boolean,
  exactTarget: number,
): boolean {
  return verifyDisplayed(base, charts.map((chart) => ({
    songId: chart.songId,
    level: chart.level,
    difficulty: chart.difficulty,
    targetAcc: maxAllowedAcc(allowPhi),
  })), exactTarget);
}

function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return Number.POSITIVE_INFINITY;
  const choose = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= choose; i += 1) {
    result = (result * (n - choose + i)) / i;
    if (result > PUSH_ENUM_LIMIT) return result;
  }
  return result;
}

function estimateEase(chart: PushChart, perChartShare: number, maxAcc: number): number {
  const needed = chart.currentChartRks + perChartShare * 30;
  const maxRks = calculateRks(chart.difficulty, maxAcc);
  if (needed > maxRks + 1e-9) return (maxAcc - chart.currentAcc) + 100;
  const ratio = Math.min(1, Math.max(0, needed / chart.difficulty));
  return Math.max(0, 55 + 45 * Math.sqrt(ratio) - chart.currentAcc);
}

async function selectPool(
  charts: readonly PushChart[],
  limit: number,
  perChartShare: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushChart[]> {
  await yieldPushSearch(control);
  if (charts.length <= limit) return [...charts];
  const maxAcc = maxAllowedAcc(allowPhi);
  const byEase = [...charts].sort((a, b) => estimateEase(a, perChartShare, maxAcc) - estimateEase(b, perChartShare, maxAcc)
    || b.maxGainRaw - a.maxGainRaw);
  const byGain = [...charts].sort((a, b) => b.maxGainRaw - a.maxGainRaw);
  const chosen = new Map<string, PushChart>();
  const easySlots = Math.max(1, limit - Math.floor(limit / 4));
  for (const chart of byEase) {
    if (chosen.size >= easySlots) break;
    chosen.set(chart.key, chart);
  }
  for (const chart of byGain) {
    if (chosen.size >= limit) break;
    chosen.set(chart.key, chart);
  }
  return [...chosen.values()];
}

async function collectCharts(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  baseSims: SimRecord[],
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushChart[]> {
  await yieldPushSearch(control);
  const maxAcc = maxAllowedAcc(allowPhi);
  const rawCurrent = calculateFinalRks(baseSims);
  const best27Keys = new Set(
    [...baseSims].sort((a, b) => b.rks - a.rks).slice(0, 27).map((record) => `${record.songId}_${record.level}`),
  );
  const charts: PushChart[] = [];
  for (const songId of new Set([...Object.keys(gameRecord), ...Object.keys(difficultyTable)])) {
    await yieldPushSearch(control);
    const levels = gameRecord[songId] ?? [];
    const diffs = difficultyTable[songId];
    if (!diffs) continue;
    for (let level = 0; level < 4; level += 1) {
      const difficulty = diffs[level] ?? 0;
      if (difficulty <= 0) continue;
      const typedLevel = level as PhigrosLevel;
      const entry = levels[level];
      const currentAcc = entry?.rawAcc ?? 0;
      if (currentAcc >= maxAcc - 1e-9) continue;
      const currentChartRks = entry ? calculateRks(difficulty, entry.rawAcc) : 0;
      const maxGainRaw = calculateFinalRks(
        replacedSims(baseSims, songId, typedLevel, difficulty, maxAcc),
      ) - rawCurrent;
      if (maxGainRaw <= 1e-9) continue;
      charts.push({
        key: `${songId}_${typedLevel}`,
        songId,
        level: typedLevel,
        difficulty,
        currentAcc,
        currentChartRks,
        isInBest27: best27Keys.has(`${songId}_${typedLevel}`),
        maxGainRaw,
        scoredEntry: entry
          ? { ...entry, difficulty, rks: currentChartRks }
          : makePlaceholderEntry(songId, typedLevel, difficulty),
      });
    }
  }
  return charts;
}

async function proveUnreachable(
  base: SimRecord[],
  charts: readonly PushChart[],
  chartCost: number,
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<boolean> {
  await yieldPushSearch(control);
  const rawCurrent = calculateFinalRks(base);
  if (rawCurrent + 1e-9 >= exactTarget) return false;
  if (!reachesAtMax(base, charts, allowPhi, exactTarget)) return true;
  const topSum = [...charts]
    .sort((a, b) => b.maxGainRaw - a.maxGainRaw)
    .slice(0, chartCost)
    .reduce((sum, chart) => sum + chart.maxGainRaw, 0);
  return rawCurrent + topSum + 1e-9 < exactTarget;
}

function contextWithout(base: SimRecord[], members: readonly PushTarget[], skipped: PushTarget): SimRecord[] {
  let context = base;
  for (const other of members) {
    if (other === skipped) continue;
    context = replacedSims(context, other.chart.songId, other.chart.level, other.chart.difficulty, other.targetAcc);
  }
  return context;
}

function canRaise(targetAcc: number, allowPhi: boolean): boolean {
  const next = roundAcc(targetAcc + 0.01);
  if (next > maxAllowedAcc(allowPhi) + 1e-9) return false;
  return allowPhi || !isAcc100Percent(next);
}

async function bumpTargets(
  base: SimRecord[],
  members: PushTarget[],
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<boolean> {
  let guard = 0;
  let progressed = true;
  while (!verifyDisplayed(base, members.map(asDisplayed), exactTarget) && progressed && guard < 2_000) {
    await yieldPushSearch(control);
    progressed = false;
    for (const member of members) {
      if (!canRaise(member.targetAcc, allowPhi)) continue;
      member.targetAcc = roundAcc(member.targetAcc + 0.01);
      progressed = true;
      guard += 1;
      if (verifyDisplayed(base, members.map(asDisplayed), exactTarget)) return true;
    }
  }
  return verifyDisplayed(base, members.map(asDisplayed), exactTarget);
}

async function commitSelection(
  base: SimRecord[],
  charts: readonly PushChart[],
  exactTarget: number,
  allowPhi: boolean,
  initial: readonly PushTarget[] | undefined,
  control: PushSearchControl,
): Promise<PushTarget[] | null> {
  await yieldPushSearch(control);
  if (charts.length === 0 || !reachesAtMax(base, charts, allowPhi, exactTarget)) return null;
  const seeded = new Map((initial ?? []).map((member) => [member.chart.key, member.targetAcc]));
  const members: PushTarget[] = charts.map((chart) => ({
    chart,
    targetAcc: seeded.get(chart.key) ?? maxAllowedAcc(allowPhi),
  }));
  for (let pass = 0; pass < members.length; pass += 1) {
    await yieldPushSearch(control);
    for (const member of members) {
      const context = contextWithout(base, members, member);
      const unchanged = calculateFinalRks(replacedSims(
        context, member.chart.songId, member.chart.level, member.chart.difficulty, member.chart.currentAcc,
      ));
      if (unchanged + 1e-9 >= exactTarget) {
        member.targetAcc = member.chart.currentAcc;
        continue;
      }
      const lowered = await minimumPushAcc(
        context,
        member.chart.songId,
        member.chart.level,
        member.chart.difficulty,
        member.chart.currentAcc,
        exactTarget,
        allowPhi,
        control,
      );
      if (lowered != null) member.targetAcc = lowered;
    }
  }
  for (const member of members) member.targetAcc = roundAcc(member.targetAcc);
  const active = members.filter((member) => member.targetAcc > member.chart.currentAcc + 1e-9);
  const chosen = active.length > 0 && verifyDisplayed(base, active.map(asDisplayed), exactTarget) ? active : members;
  if (!await bumpTargets(base, chosen, exactTarget, allowPhi, control)) return null;
  return chosen.length > 0 ? chosen : null;
}

async function greedySpread(
  base: SimRecord[],
  pool: readonly PushChart[],
  chartCost: number,
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushTarget[]> {
  let sims = base;
  const selected: PushTarget[] = [];
  const maxAcc = maxAllowedAcc(allowPhi);
  while (selected.length < chartCost && calculateFinalRks(sims) + 1e-9 < exactTarget) {
    await yieldPushSearch(control);
    const now = calculateFinalRks(sims);
    const stepGoal = now + (exactTarget - now) / (chartCost - selected.length);
    let bestShare: { chart: PushChart; accDiff: number } | null = null;
    let bestMarginal: { chart: PushChart; gain: number } | null = null;
    for (const chart of pool) {
      if (selected.some((item) => item.chart.key === chart.key)) continue;
      const shareAcc = await minimumPushAcc(
        sims, chart.songId, chart.level, chart.difficulty, chart.currentAcc, stepGoal, allowPhi, control,
      );
      if (shareAcc != null) {
        const accDiff = shareAcc - chart.currentAcc;
        if (!bestShare || accDiff < bestShare.accDiff - 1e-12
          || (Math.abs(accDiff - bestShare.accDiff) <= 1e-12 && chart.difficulty < bestShare.chart.difficulty)) {
          bestShare = { chart, accDiff };
        }
      }
      const gain = calculateFinalRks(replacedSims(sims, chart.songId, chart.level, chart.difficulty, maxAcc)) - now;
      if (gain > 1e-9 && (!bestMarginal || gain > bestMarginal.gain)) bestMarginal = { chart, gain };
    }
    const next = bestShare?.chart ?? bestMarginal?.chart;
    if (!next) break;
    const appliedAcc = bestShare?.chart === next
      ? await minimumPushAcc(sims, next.songId, next.level, next.difficulty, next.currentAcc, stepGoal, allowPhi, control) ?? maxAcc
      : maxAcc;
    selected.push({ chart: next, targetAcc: appliedAcc });
    sims = replacedSims(sims, next.songId, next.level, next.difficulty, appliedAcc);
  }
  return selected;
}

async function forEachCombination(
  items: readonly PushChart[],
  size: number,
  visit: (combo: readonly PushChart[]) => Promise<boolean>,
  control: PushSearchControl,
): Promise<void> {
  const chosen: PushChart[] = [];
  const walk = async (start: number): Promise<boolean> => {
    await yieldPushSearch(control);
    if (chosen.length === size) return visit(chosen);
    const need = size - chosen.length;
    for (let index = start; index <= items.length - need; index += 1) {
      chosen.push(items[index]!);
      if (await walk(index + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  await walk(0);
}

async function firstEnumerated(
  base: SimRecord[],
  pool: readonly PushChart[],
  chartCost: number,
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushTarget[] | null> {
  for (let size = Math.min(chartCost, pool.length); size >= 1; size -= 1) {
    await yieldPushSearch(control);
    if (combinationCount(pool.length, size) > PUSH_ENUM_LIMIT) continue;
    let found: PushTarget[] | null = null;
    await forEachCombination(pool, size, async (combo) => {
      if (!reachesAtMax(base, combo, allowPhi, exactTarget)) return false;
      found = await commitSelection(base, [...combo], exactTarget, allowPhi, undefined, control);
      return found != null;
    }, control);
    if (found) return found;
  }
  return null;
}

async function beamSearch(
  base: SimRecord[],
  pool: readonly PushChart[],
  chartCost: number,
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushChart[] | null> {
  await yieldPushSearch(control);
  const maxAcc = maxAllowedAcc(allowPhi);
  type BeamState = { keys: string[]; charts: PushChart[]; sims: SimRecord[]; rks: number };
  let beam: BeamState[] = [{ keys: [], charts: [], sims: base, rks: calculateFinalRks(base) }];
  let used = 0;
  for (let depth = 0; depth < chartCost; depth += 1) {
    await yieldPushSearch(control);
    const next: BeamState[] = [];
    for (const state of beam) {
      if (state.charts.length > 0 && state.rks + 1e-9 >= exactTarget) return state.charts;
      const owned = new Set(state.keys);
      for (const chart of pool) {
        if (owned.has(chart.key)) continue;
        used += 1;
        await yieldPushSearch(control);
        const sims = replacedSims(state.sims, chart.songId, chart.level, chart.difficulty, maxAcc);
        const rks = calculateFinalRks(sims);
        const charts = [...state.charts, chart];
        if (rks + 1e-9 >= exactTarget) return charts;
        next.push({ keys: [...state.keys, chart.key], charts, sims, rks });
        if (used > PUSH_NODE_BUDGET) {
          return next.find((item) => item.rks + 1e-9 >= exactTarget)?.charts ?? null;
        }
      }
    }
    const dedup = new Map<string, BeamState>();
    for (const state of next) {
      const id = [...state.keys].sort().join('|');
      const previous = dedup.get(id);
      if (!previous || state.rks > previous.rks) dedup.set(id, state);
    }
    beam = [...dedup.values()].sort((a, b) => b.rks - a.rks).slice(0, PUSH_BEAM_WIDTH);
    if (beam.length === 0) return null;
  }
  return beam.find((state) => state.charts.length > 0 && state.rks + 1e-9 >= exactTarget)?.charts ?? null;
}

function asDisplayed(member: PushTarget): DisplayedPush {
  return {
    songId: member.chart.songId,
    level: member.chart.level,
    difficulty: member.chart.difficulty,
    targetAcc: member.targetAcc,
  };
}

function presentMember(member: PushTarget, context: SimRecord[]): PushRecommendation {
  const targetAcc = roundAcc(member.targetAcc);
  return {
    songId: member.chart.songId,
    level: member.chart.level,
    difficulty: member.chart.difficulty,
    currentAcc: roundAcc(member.chart.currentAcc),
    targetAcc,
    accDiff: roundAcc(Math.max(0, targetAcc - member.chart.currentAcc)),
    currentChartRks: roundAcc(member.chart.currentChartRks),
    expectedChartRks: roundAcc(calculateRks(member.chart.difficulty, targetAcc)),
    isInBest27: member.chart.isInBest27,
    rksGain: marginalGain(
      context, member.chart.songId, member.chart.level, member.chart.difficulty, targetAcc,
    ),
    maxPossibleGain: roundRks(member.chart.maxGainRaw),
    record: phigrosEntryToScoreRecord(member.chart.scoredEntry),
  };
}

function presentPlan(base: SimRecord[], members: readonly PushTarget[]): PushRecommendation[] {
  return members.map((member) => presentMember(member, contextWithout(base, members, member)))
    .sort((a, b) => a.accDiff - b.accDiff || a.difficulty - b.difficulty);
}

function hardestRecommendation(plan: readonly PushRecommendation[]): PushRecommendation {
  return [...plan].sort((a, b) => b.accDiff - a.accDiff || b.difficulty - a.difficulty)[0]!;
}

async function findAlternatives(
  base: SimRecord[],
  plan: readonly PushRecommendation[],
  charts: readonly PushChart[],
  perChartShare: number,
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushRecommendation[]> {
  await yieldPushSearch(control);
  if (plan.length === 0) return [];
  const hardest = hardestRecommendation(plan);
  const alternatives: PushRecommendation[] = [];
  for (const chart of await selectPool(charts, PUSH_ALTERNATIVE_LIMIT, perChartShare, allowPhi, control)) {
    await yieldPushSearch(control);
    if (plan.some((item) => item.songId === chart.songId && item.level === chart.level)) continue;
    let context = base;
    for (const member of plan) {
      if (member.songId === hardest.songId && member.level === hardest.level) continue;
      context = replacedSims(context, member.songId, member.level, member.difficulty, member.targetAcc);
    }
    const minimum = await minimumPushAcc(
      context, chart.songId, chart.level, chart.difficulty, chart.currentAcc, exactTarget, allowPhi, control,
    );
    if (minimum == null) continue;
    let targetAcc = roundAcc(minimum);
    const swapped = (): DisplayedPush[] => [
      ...plan
        .filter((member) => member.songId !== hardest.songId || member.level !== hardest.level)
        .map((member) => ({
          songId: member.songId, level: member.level, difficulty: member.difficulty, targetAcc: member.targetAcc,
        })),
      { songId: chart.songId, level: chart.level, difficulty: chart.difficulty, targetAcc },
    ];
    let guard = 0;
    while (!verifyDisplayed(base, swapped(), exactTarget) && canRaise(targetAcc, allowPhi) && guard < 200) {
      targetAcc = roundAcc(targetAcc + 0.01);
      guard += 1;
    }
    if (!verifyDisplayed(base, swapped(), exactTarget)) continue;
    alternatives.push(presentMember({ chart, targetAcc }, context));
  }
  return alternatives.sort((a, b) => a.accDiff - b.accDiff || a.difficulty - b.difficulty);
}

async function realizePlan(
  base: SimRecord[],
  members: PushTarget[] | null,
  exactTarget: number,
  control: PushSearchControl,
): Promise<PushRecommendation[] | null> {
  await yieldPushSearch(control);
  if (!members || members.length === 0) return null;
  const shown = presentPlan(base, members);
  return verifyDisplayed(base, shown, exactTarget) ? shown : null;
}

async function searchJointPlan(
  base: SimRecord[],
  pool: readonly PushChart[],
  chartCost: number,
  exactTarget: number,
  allowPhi: boolean,
  control: PushSearchControl,
): Promise<PushRecommendation[] | null> {
  await yieldPushSearch(control);
  const greedy = await greedySpread(base, pool, chartCost, exactTarget, allowPhi, control);
  const greedyCharts = greedy.map((member) => member.chart);
  const fromGreedy = reachesAtMax(base, greedyCharts, allowPhi, exactTarget)
    ? await realizePlan(base, await commitSelection(base, greedyCharts, exactTarget, allowPhi, greedy, control), exactTarget, control)
    : null;
  if (fromGreedy) return fromGreedy;
  await yieldPushSearch(control);
  const enumerated = await realizePlan(
    base, await firstEnumerated(base, pool, chartCost, exactTarget, allowPhi, control), exactTarget, control,
  );
  if (enumerated) return enumerated;
  await yieldPushSearch(control);
  const beamed = await beamSearch(base, pool, chartCost, exactTarget, allowPhi, control);
  if (!beamed) return null;
  return realizePlan(base, await commitSelection(base, beamed, exactTarget, allowPhi, undefined, control), exactTarget, control);
}

function makePlaceholderEntry(
  songId: string,
  level: PhigrosLevel,
  difficulty: number,
): PhigrosScoreEntry {
  return {
    songId,
    level,
    difficulty,
    score: 0,
    rawAcc: 0,
    acc: 0,
    fc: false,
    rks: 0,
  };
}

function finishPushResult(
  base: Omit<PushRecommendationsResult, 'searchStatus' | 'combinationReachesTarget' | 'plan' | 'alternatives' | 'recommendations'>,
  searchStatus: PushSearchStatus,
  plan: PushRecommendation[],
  alternatives: PushRecommendation[],
): PushRecommendationsResult {
  const verified = searchStatus === 'verified';
  const shown = verified ? plan : [];
  return {
    ...base,
    searchStatus,
    combinationReachesTarget: verified,
    plan: shown,
    alternatives: verified ? alternatives : [],
    recommendations: shown,
  };
}

/**
 * 推分推荐。单谱面和多谱面都返回已取整并重新核算的 plan。
 * chartCost 的单位是谱面：同一首歌的不同难度各占一张预算。
 * 参数先经 resolvePhigrosPushRequest 校验：delta 与 chartCost 非法时抛出
 * PhigrosPushInputError（异步拒绝），不会返回搜索状态。
 * 多张不再要求每一张单独达到平均份额；搜索预算内找不到方案时状态为 not_found。
 * includePhi=false 时最高目标 Acc 为 99.99，不把 φ 计入可达上界。
 * searchPoolLimit 只限制联合搜索候选池，不改变不可达上界所使用的全部谱面。
 * 长搜索按时间片让出主线程；signal 取消时在让出点抛出来源 reason，不返回半份方案。
 */
export async function findPushRecommendations(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  options: { delta: number; chartCost: number; includePhi?: boolean; searchPoolLimit?: number; signal?: AbortSignal },
): Promise<PushRecommendationsResult> {
  const request = resolvePhigrosPushRequest(options);
  const control: PushSearchControl = { signal: request.signal, lastYield: Date.now() };
  return findPushRecommendationsWithControl(gameRecord, difficultyTable, request, control);
}

async function findPushRecommendationsWithControl(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  request: PhigrosPushRequest,
  control: PushSearchControl,
): Promise<PushRecommendationsResult> {
  await yieldPushSearch(control);
  const chartCost = request.chartCost;
  const includePhi = request.includePhi;
  const poolLimit = Math.max(1, Math.floor(request.searchPoolLimit ?? PUSH_POOL_LIMIT));
  const baseSims = toSimRecords(collectScoredEntries(gameRecord, difficultyTable));
  const rawCurrent = calculateFinalRks(baseSims);
  const currentRks = roundRks(rawCurrent);
  const { displayRks, exactTarget, displayTarget } = resolvePushExactTarget(currentRks, request.delta);
  const gainNeeded = Math.max(0, exactTarget - currentRks);
  const perChartShare = gainNeeded / chartCost;
  const shell = {
    currentRks,
    displayRks,
    exactTarget,
    displayTarget,
    chartCost,
    gainNeeded: roundRks(gainNeeded),
    perChartShare: roundRks(perChartShare),
    includePhi,
  };
  if (rawCurrent + 1e-9 >= exactTarget) return finishPushResult(shell, 'verified', [], []);
  await yieldPushSearch(control);
  const charts = await collectCharts(gameRecord, difficultyTable, baseSims, includePhi, control);
  if (await proveUnreachable(baseSims, charts, chartCost, exactTarget, includePhi, control)) {
    return finishPushResult(shell, 'unreachable', [], []);
  }
  await yieldPushSearch(control);
  const pool = await selectPool(charts, poolLimit, perChartShare, includePhi, control);
  const plan = await searchJointPlan(baseSims, pool, chartCost, exactTarget, includePhi, control);
  if (!plan) return finishPushResult(shell, 'not_found', [], []);
  await yieldPushSearch(control);
  return finishPushResult(
    shell,
    'verified',
    plan,
    await findAlternatives(baseSims, plan, charts, perChartShare, exactTarget, includePhi, control),
  );
}

/** 把展示给用户的曲目和 targetAcc 应用到原始成绩后的精确 RKS。 */
export function evaluateDisplayedPushPlan(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  displayed: readonly DisplayedPush[],
): number {
  const base = toSimRecords(collectScoredEntries(gameRecord, difficultyTable));
  let sims = base;
  for (const item of displayed) {
    sims = replacedSims(sims, item.songId, item.level, item.difficulty, item.targetAcc);
  }
  return calculateFinalRks(sims);
}

/** 搜索状态对应的页面说明。未找到方案时不写成数学意义上的无解。 */
export function formatPushSearchSummary(result: PushRecommendationsResult): string {
  const phi = result.includePhi ? '' : '（已排除 φ）';
  const adjust = `可增加成本谱面数、降低加值${result.includePhi ? '' : '或开启包含 φ'}。`;
  if (result.searchStatus === 'verified') {
    if (result.plan.length === 0) return '当前成绩已经达到精确目标';
    return `以下 ${result.plan.length} 张谱面一起可以达到精确目标`;
  }
  if (result.searchStatus === 'not_found') {
    return `在当前搜索范围内没有找到方案${phi}，${adjust}`;
  }
  if (result.chartCost <= 1) {
    return `没有谱面能承担 ${result.perChartShare.toFixed(4)} 的加值${phi}，${adjust}`;
  }
  return `现有谱面无法用 ${result.chartCost} 张谱面达到该目标${phi}，${adjust}`;
}

export function formatPushAcc(acc: number): string {
  return acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
}
