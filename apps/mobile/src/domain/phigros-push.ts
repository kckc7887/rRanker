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
  /** 愿意打的歌数 */
  songCost: number;
  /** 精确总加值（exactTarget - currentRks） */
  gainNeeded: number;
  /** 每首歌需承担的总 RKS 份额（gainNeeded / songCost） */
  perSongShare: number;
  /** 是否包含目标 Acc 为 100%（φ）的谱面 */
  includePhi: boolean;
  /**
   * verified：plan 已取整并重新核算，精确 RKS 达到目标。
   * not_found：搜索预算内没有找到方案，不能据此断定无解。
   * unreachable：上界证明在 φ 约束和成本歌数内无法达到。
   */
  searchStatus: PushSearchStatus;
  /** 与 searchStatus === 'verified' 相同。 */
  combinationReachesTarget: boolean;
  /** 已验证方案，长度不超过 songCost。页面只能对这组作达标保证。 */
  plan: PushRecommendation[];
  /**
   * 可替换 plan 中 Acc 差值最大的一首（Acc 差值相同则取定数更高者）。
   * 替换后重新核算仍达标。不进入 plan，也不能与 plan 混排后宣称前 N 首达标。
   */
  alternatives: PushRecommendation[];
  /** 与 plan 相同。 */
  recommendations: PushRecommendation[];
};

export type PushSearchStatus = 'verified' | 'not_found' | 'unreachable';

type SimRecord = {
  songId: string;
  level: PhigrosLevel;
  rks: number;
  difficulty: number;
  isPhi: boolean;
};

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
function minimumPushAcc(
  sims: SimRecord[],
  songId: string,
  level: PhigrosLevel,
  difficulty: number,
  currentAcc: number,
  goalRks: number,
  allowPhi: boolean,
): number | null {
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

function estimateEase(chart: PushChart, perSongShare: number, maxAcc: number): number {
  const needed = chart.currentChartRks + perSongShare * 30;
  const maxRks = calculateRks(chart.difficulty, maxAcc);
  if (needed > maxRks + 1e-9) return (maxAcc - chart.currentAcc) + 100;
  const ratio = Math.min(1, Math.max(0, needed / chart.difficulty));
  return Math.max(0, 55 + 45 * Math.sqrt(ratio) - chart.currentAcc);
}

function selectPool(charts: readonly PushChart[], limit: number, perSongShare: number, allowPhi: boolean): PushChart[] {
  if (charts.length <= limit) return [...charts];
  const maxAcc = maxAllowedAcc(allowPhi);
  const byEase = [...charts].sort((a, b) => estimateEase(a, perSongShare, maxAcc) - estimateEase(b, perSongShare, maxAcc)
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

function collectCharts(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  baseSims: SimRecord[],
  allowPhi: boolean,
): PushChart[] {
  const maxAcc = maxAllowedAcc(allowPhi);
  const rawCurrent = calculateFinalRks(baseSims);
  const best27Keys = new Set(
    [...baseSims].sort((a, b) => b.rks - a.rks).slice(0, 27).map((record) => `${record.songId}_${record.level}`),
  );
  const charts: PushChart[] = [];
  for (const songId of new Set([...Object.keys(gameRecord), ...Object.keys(difficultyTable)])) {
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

function proveUnreachable(
  base: SimRecord[],
  charts: readonly PushChart[],
  songCost: number,
  exactTarget: number,
  allowPhi: boolean,
): boolean {
  const rawCurrent = calculateFinalRks(base);
  if (rawCurrent + 1e-9 >= exactTarget) return false;
  if (!reachesAtMax(base, charts, allowPhi, exactTarget)) return true;
  const topSum = [...charts]
    .sort((a, b) => b.maxGainRaw - a.maxGainRaw)
    .slice(0, songCost)
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

function bumpTargets(base: SimRecord[], members: PushTarget[], exactTarget: number, allowPhi: boolean): boolean {
  let guard = 0;
  let progressed = true;
  while (!verifyDisplayed(base, members.map(asDisplayed), exactTarget) && progressed && guard < 2_000) {
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

function commitSelection(
  base: SimRecord[],
  charts: readonly PushChart[],
  exactTarget: number,
  allowPhi: boolean,
  initial?: readonly PushTarget[],
): PushTarget[] | null {
  if (charts.length === 0 || !reachesAtMax(base, charts, allowPhi, exactTarget)) return null;
  const seeded = new Map((initial ?? []).map((member) => [member.chart.key, member.targetAcc]));
  const members: PushTarget[] = charts.map((chart) => ({
    chart,
    targetAcc: seeded.get(chart.key) ?? maxAllowedAcc(allowPhi),
  }));
  for (let pass = 0; pass < members.length; pass += 1) {
    for (const member of members) {
      const context = contextWithout(base, members, member);
      const unchanged = calculateFinalRks(replacedSims(
        context, member.chart.songId, member.chart.level, member.chart.difficulty, member.chart.currentAcc,
      ));
      if (unchanged + 1e-9 >= exactTarget) {
        member.targetAcc = member.chart.currentAcc;
        continue;
      }
      const lowered = minimumPushAcc(
        context,
        member.chart.songId,
        member.chart.level,
        member.chart.difficulty,
        member.chart.currentAcc,
        exactTarget,
        allowPhi,
      );
      if (lowered != null) member.targetAcc = lowered;
    }
  }
  for (const member of members) member.targetAcc = roundAcc(member.targetAcc);
  const active = members.filter((member) => member.targetAcc > member.chart.currentAcc + 1e-9);
  const chosen = active.length > 0 && verifyDisplayed(base, active.map(asDisplayed), exactTarget) ? active : members;
  if (!bumpTargets(base, chosen, exactTarget, allowPhi)) return null;
  return chosen.length > 0 ? chosen : null;
}

function greedySpread(
  base: SimRecord[],
  pool: readonly PushChart[],
  songCost: number,
  exactTarget: number,
  allowPhi: boolean,
): PushTarget[] {
  let sims = base;
  const selected: PushTarget[] = [];
  const maxAcc = maxAllowedAcc(allowPhi);
  while (selected.length < songCost && calculateFinalRks(sims) + 1e-9 < exactTarget) {
    const now = calculateFinalRks(sims);
    const stepGoal = now + (exactTarget - now) / (songCost - selected.length);
    let bestShare: { chart: PushChart; accDiff: number } | null = null;
    let bestMarginal: { chart: PushChart; gain: number } | null = null;
    for (const chart of pool) {
      if (selected.some((item) => item.chart.key === chart.key)) continue;
      const shareAcc = minimumPushAcc(
        sims, chart.songId, chart.level, chart.difficulty, chart.currentAcc, stepGoal, allowPhi,
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
      ? minimumPushAcc(sims, next.songId, next.level, next.difficulty, next.currentAcc, stepGoal, allowPhi) ?? maxAcc
      : maxAcc;
    selected.push({ chart: next, targetAcc: appliedAcc });
    sims = replacedSims(sims, next.songId, next.level, next.difficulty, appliedAcc);
  }
  return selected;
}

function forEachCombination(
  items: readonly PushChart[],
  size: number,
  visit: (combo: readonly PushChart[]) => boolean,
): void {
  const chosen: PushChart[] = [];
  const walk = (start: number): boolean => {
    if (chosen.length === size) return visit(chosen);
    const need = size - chosen.length;
    for (let index = start; index <= items.length - need; index += 1) {
      chosen.push(items[index]!);
      if (walk(index + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  walk(0);
}

function firstEnumerated(
  base: SimRecord[],
  pool: readonly PushChart[],
  songCost: number,
  exactTarget: number,
  allowPhi: boolean,
): PushTarget[] | null {
  for (let size = Math.min(songCost, pool.length); size >= 1; size -= 1) {
    if (combinationCount(pool.length, size) > PUSH_ENUM_LIMIT) continue;
    let found: PushTarget[] | null = null;
    forEachCombination(pool, size, (combo) => {
      if (!reachesAtMax(base, combo, allowPhi, exactTarget)) return false;
      found = commitSelection(base, [...combo], exactTarget, allowPhi);
      return found != null;
    });
    if (found) return found;
  }
  return null;
}

function beamSearch(
  base: SimRecord[],
  pool: readonly PushChart[],
  songCost: number,
  exactTarget: number,
  allowPhi: boolean,
): PushChart[] | null {
  const maxAcc = maxAllowedAcc(allowPhi);
  type BeamState = { keys: string[]; charts: PushChart[]; sims: SimRecord[]; rks: number };
  let beam: BeamState[] = [{ keys: [], charts: [], sims: base, rks: calculateFinalRks(base) }];
  let used = 0;
  for (let depth = 0; depth < songCost; depth += 1) {
    const next: BeamState[] = [];
    for (const state of beam) {
      if (state.charts.length > 0 && state.rks + 1e-9 >= exactTarget) return state.charts;
      const owned = new Set(state.keys);
      for (const chart of pool) {
        if (owned.has(chart.key)) continue;
        used += 1;
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

function findAlternatives(
  base: SimRecord[],
  plan: readonly PushRecommendation[],
  charts: readonly PushChart[],
  perSongShare: number,
  exactTarget: number,
  allowPhi: boolean,
): PushRecommendation[] {
  if (plan.length === 0) return [];
  const hardest = hardestRecommendation(plan);
  const alternatives: PushRecommendation[] = [];
  for (const chart of selectPool(charts, PUSH_ALTERNATIVE_LIMIT, perSongShare, allowPhi)) {
    if (plan.some((item) => item.songId === chart.songId && item.level === chart.level)) continue;
    let context = base;
    for (const member of plan) {
      if (member.songId === hardest.songId && member.level === hardest.level) continue;
      context = replacedSims(context, member.songId, member.level, member.difficulty, member.targetAcc);
    }
    const minimum = minimumPushAcc(
      context, chart.songId, chart.level, chart.difficulty, chart.currentAcc, exactTarget, allowPhi,
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

function realizePlan(
  base: SimRecord[],
  members: PushTarget[] | null,
  exactTarget: number,
): PushRecommendation[] | null {
  if (!members || members.length === 0) return null;
  const shown = presentPlan(base, members);
  return verifyDisplayed(base, shown, exactTarget) ? shown : null;
}

function searchJointPlan(
  base: SimRecord[],
  pool: readonly PushChart[],
  songCost: number,
  exactTarget: number,
  allowPhi: boolean,
): PushRecommendation[] | null {
  const greedy = greedySpread(base, pool, songCost, exactTarget, allowPhi);
  const greedyCharts = greedy.map((member) => member.chart);
  const fromGreedy = reachesAtMax(base, greedyCharts, allowPhi, exactTarget)
    ? realizePlan(base, commitSelection(base, greedyCharts, exactTarget, allowPhi, greedy), exactTarget)
    : null;
  if (fromGreedy) return fromGreedy;
  const enumerated = realizePlan(
    base, firstEnumerated(base, pool, songCost, exactTarget, allowPhi), exactTarget,
  );
  if (enumerated) return enumerated;
  const beamed = beamSearch(base, pool, songCost, exactTarget, allowPhi);
  if (!beamed) return null;
  return realizePlan(base, commitSelection(base, beamed, exactTarget, allowPhi), exactTarget);
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
 * 推分推荐。单曲和多首都返回已取整并重新核算的 plan。
 * 多首不再要求每一首单独达到平均份额；搜索预算内找不到方案时状态为 not_found。
 * includePhi=false 时最高目标 Acc 为 99.99，不把 φ 计入可达上界。
 * searchPoolLimit 只限制联合搜索候选池，不改变不可达上界所使用的全部谱面。
 */
export function findPushRecommendations(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  options: { delta: number; songCost: number; includePhi?: boolean; searchPoolLimit?: number },
): PushRecommendationsResult {
  const songCost = Math.max(1, Math.floor(options.songCost));
  const includePhi = options.includePhi !== false;
  const poolLimit = Math.max(1, Math.floor(options.searchPoolLimit ?? PUSH_POOL_LIMIT));
  const baseSims = toSimRecords(collectScoredEntries(gameRecord, difficultyTable));
  const rawCurrent = calculateFinalRks(baseSims);
  const currentRks = roundRks(rawCurrent);
  const { displayRks, exactTarget, displayTarget } = resolvePushExactTarget(currentRks, options.delta);
  const gainNeeded = Math.max(0, exactTarget - currentRks);
  const perSongShare = gainNeeded / songCost;
  const shell = {
    currentRks,
    displayRks,
    exactTarget,
    displayTarget,
    songCost,
    gainNeeded: roundRks(gainNeeded),
    perSongShare: roundRks(perSongShare),
    includePhi,
  };
  if (rawCurrent + 1e-9 >= exactTarget) return finishPushResult(shell, 'verified', [], []);
  const charts = collectCharts(gameRecord, difficultyTable, baseSims, includePhi);
  if (proveUnreachable(baseSims, charts, songCost, exactTarget, includePhi)) {
    return finishPushResult(shell, 'unreachable', [], []);
  }
  const pool = selectPool(charts, poolLimit, perSongShare, includePhi);
  const plan = searchJointPlan(baseSims, pool, songCost, exactTarget, includePhi);
  if (!plan) return finishPushResult(shell, 'not_found', [], []);
  return finishPushResult(
    shell,
    'verified',
    plan,
    findAlternatives(baseSims, plan, charts, perSongShare, exactTarget, includePhi),
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
  const adjust = `可增加成本歌数、降低加值${result.includePhi ? '' : '或开启包含 φ'}。`;
  if (result.searchStatus === 'verified') {
    if (result.plan.length === 0) return '当前成绩已经达到精确目标';
    return `以下 ${result.plan.length} 首一起可以达到精确目标`;
  }
  if (result.searchStatus === 'not_found') {
    return `在当前搜索范围内没有找到方案${phi}，${adjust}`;
  }
  if (result.songCost <= 1) {
    return `没有谱面能承担 ${result.perSongShare.toFixed(4)} 的加值${phi}，${adjust}`;
  }
  return `现有谱面无法用 ${result.songCost} 首达到该目标${phi}，${adjust}`;
}

export function formatPushAcc(acc: number): string {
  return acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
}
