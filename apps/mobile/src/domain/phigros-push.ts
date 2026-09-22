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
  /** 推荐里的目标 Acc 放进同一 Best27/Phi3 后，能否达到精确目标。 */
  combinationReachesTarget: boolean;
  recommendations: PushRecommendation[];
};

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

/**
 * 在同一套 Best27/Phi3 上按剩余缺口分摊，选出最多 songCost 首并互相压低目标 Acc。
 * 这组一起仍达不到精确目标时不返回单曲份额目标。
 */
function jointPlan(
  baseSims: SimRecord[],
  candidates: PushRecommendation[],
  songCost: number,
  exactTarget: number,
  allowPhi: boolean,
): PushRecommendation[] {
  let sims = baseSims;
  const selected: { candidate: PushRecommendation; targetAcc: number }[] = [];
  for (let slot = 0; slot < songCost; slot += 1) {
    const now = calculateFinalRks(sims);
    if (now + 1e-9 >= exactTarget) break;
    const stepGoal = now + (exactTarget - now) / (songCost - slot);
    let best: { candidate: PushRecommendation; targetAcc: number } | null = null;
    for (const candidate of candidates) {
      if (selected.some((item) => item.candidate.songId === candidate.songId && item.candidate.level === candidate.level)) continue;
      const targetAcc = minimumPushAcc(
        sims, candidate.songId, candidate.level, candidate.difficulty, candidate.currentAcc, stepGoal, allowPhi,
      );
      if (targetAcc == null) continue;
      const accDiff = targetAcc - candidate.currentAcc;
      if (!best || accDiff < best.targetAcc - best.candidate.currentAcc) best = { candidate, targetAcc };
    }
    if (!best) break;
    selected.push(best);
    sims = replacedSims(sims, best.candidate.songId, best.candidate.level, best.candidate.difficulty, best.targetAcc);
  }

  for (let pass = 0; pass < selected.length; pass += 1) {
    for (const member of selected) {
      let context = baseSims;
      for (const other of selected) {
        if (other === member) continue;
        context = replacedSims(context, other.candidate.songId, other.candidate.level, other.candidate.difficulty, other.targetAcc);
      }
      const targetAcc = minimumPushAcc(
        context, member.candidate.songId, member.candidate.level, member.candidate.difficulty,
        member.candidate.currentAcc, exactTarget, allowPhi,
      );
      if (targetAcc != null) member.targetAcc = targetAcc;
    }
  }

  sims = baseSims;
  for (const member of selected) {
    sims = replacedSims(sims, member.candidate.songId, member.candidate.level, member.candidate.difficulty, member.targetAcc);
  }
  if (calculateFinalRks(sims) + 1e-9 < exactTarget) return [];

  const planned = new Set(selected.map((member) => `${member.candidate.songId}_${member.candidate.level}`));
  const hardest = [...selected].sort(
    (a, b) => (b.targetAcc - b.candidate.currentAcc) - (a.targetAcc - a.candidate.currentAcc),
  )[0];
  const extras: { candidate: PushRecommendation; targetAcc: number }[] = [];
  if (hardest && selected.length === songCost) {
    for (const candidate of candidates) {
      const key = `${candidate.songId}_${candidate.level}`;
      if (planned.has(key)) continue;
      let context = baseSims;
      for (const partner of selected) {
        if (partner === hardest) continue;
        context = replacedSims(context, partner.candidate.songId, partner.candidate.level, partner.candidate.difficulty, partner.targetAcc);
      }
      const targetAcc = minimumPushAcc(
        context, candidate.songId, candidate.level, candidate.difficulty, candidate.currentAcc, exactTarget, allowPhi,
      );
      if (targetAcc == null) continue;
      extras.push({ candidate, targetAcc });
    }
  }

  return [...selected, ...extras].map((member) => {
    let context = baseSims;
    for (const other of selected) {
      if (other.candidate.songId === member.candidate.songId && other.candidate.level === member.candidate.level) continue;
      if (hardest && member.candidate !== hardest.candidate
        && other === hardest
        && !selected.some((item) => item.candidate.songId === member.candidate.songId && item.candidate.level === member.candidate.level)) {
        continue;
      }
      context = replacedSims(context, other.candidate.songId, other.candidate.level, other.candidate.difficulty, other.targetAcc);
    }
    const targetAcc = roundAcc(member.targetAcc);
    return {
      ...member.candidate,
      targetAcc,
      accDiff: roundAcc(Math.max(0, targetAcc - member.candidate.currentAcc)),
      expectedChartRks: roundAcc(calculateRks(member.candidate.difficulty, targetAcc)),
      rksGain: marginalGain(context, member.candidate.songId, member.candidate.level, member.candidate.difficulty, targetAcc),
    };
  }).sort((a, b) => a.accDiff - b.accDiff || a.difficulty - b.difficulty);
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

/**
 * 推分推荐：单曲时每张谱面单独承担全部加值。
 * 多首时在同一套 Best27/Phi3 上联合分摊；这组达不到精确目标时不展示单曲份额。
 * includePhi=false 时排除目标 Acc 为 100%（φ）的谱面。
 */
export function findPushRecommendations(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  options: { delta: number; songCost: number; includePhi?: boolean },
): PushRecommendationsResult {
  const songCost = Math.max(1, Math.floor(options.songCost));
  const includePhi = options.includePhi !== false;
  const { delta } = options;
  const scored = collectScoredEntries(gameRecord, difficultyTable);
  const baseSims = toSimRecords(scored);
  const currentRks = roundRks(calculateFinalRks(baseSims));
  const { displayRks, exactTarget, displayTarget } = resolvePushExactTarget(currentRks, delta);

  const gainNeeded = Math.max(0, exactTarget - currentRks);
  const perSongShare = gainNeeded / songCost;
  /** 单曲二分目标：当前 RKS + 每首歌应承担份额 */
  const perSongTarget = currentRks + perSongShare;

  const best27Keys = new Set(
    [...baseSims]
      .sort((a, b) => b.rks - a.rks)
      .slice(0, 27)
      .map((r) => `${r.songId}_${r.level}`),
  );

  const recommendations: PushRecommendation[] = [];
  const songIds = new Set([...Object.keys(gameRecord), ...Object.keys(difficultyTable)]);
  // 份额极小时用一个下限，避免浮点噪声；正常按份额判断可行性
  const minGainGate = Math.max(perSongShare * 0.99, 1e-6);

  for (const songId of songIds) {
    const levels = gameRecord[songId] ?? [];
    const diffs = difficultyTable[songId];
    if (!diffs) continue;

    for (let level = 0; level < 4; level++) {
      const diff = diffs[level] ?? 0;
      if (diff <= 0) continue;

      const entry = levels[level];
      const currentAcc = entry?.rawAcc ?? 0;
      const currentChartRks = entry ? calculateRks(diff, entry.rawAcc) : 0;
      const isInBest27 = best27Keys.has(`${songId}_${level}`);

      const at100 = withReplacedChart(baseSims, songId, level as PhigrosLevel, {
        rks: calculateRks(diff, 100),
        difficulty: diff,
        isPhi: true,
      });
      const maxPossibleGain = calculateFinalRks(at100) - currentRks;
      if (maxPossibleGain < minGainGate) continue;

      let lowAcc = Math.max(55.01, currentAcc - 5);
      let highAcc = 100;
      let targetAcc: number | null = null;

      for (let iter = 0; iter < 100; iter++) {
        const midAcc = (lowAcc + highAcc) / 2;
        const testRks = calculateRks(diff, midAcc);
        const temp = withReplacedChart(baseSims, songId, level as PhigrosLevel, {
          rks: testRks,
          difficulty: diff,
          isPhi: isAcc100Percent(midAcc),
        });
        const tempFinal = calculateFinalRks(temp);
        if (tempFinal >= perSongTarget) {
          targetAcc = midAcc;
          highAcc = midAcc;
        } else {
          lowAcc = midAcc;
        }
      }

      if (targetAcc == null || targetAcc > 100) continue;

      // 展示用两位小数：向上取到仍能过线的最小两位 ACC
      let snappedAcc = Math.ceil(targetAcc * 100 - 1e-9) / 100;
      if (snappedAcc > 100) snappedAcc = 100;
      const verify = withReplacedChart(baseSims, songId, level as PhigrosLevel, {
        rks: calculateRks(diff, snappedAcc),
        difficulty: diff,
        isPhi: isAcc100Percent(snappedAcc),
      });
      if (calculateFinalRks(verify) < perSongTarget) {
        snappedAcc = Math.min(100, snappedAcc + 0.01);
      }
      targetAcc = snappedAcc;

      if (!includePhi && isAcc100Percent(targetAcc)) continue;

      const accDiff = Math.max(0, targetAcc - currentAcc);
      const expectedChartRks = calculateRks(diff, targetAcc);
      const after = withReplacedChart(baseSims, songId, level as PhigrosLevel, {
        rks: expectedChartRks,
        difficulty: diff,
        isPhi: isAcc100Percent(targetAcc),
      });
      const rksGain = roundRks(calculateFinalRks(after) - currentRks);
      if (rksGain + 1e-9 < perSongShare) continue;

      const scoredEntry: PhigrosScoreEntry = entry
        ? { ...entry, difficulty: diff, rks: currentChartRks }
        : makePlaceholderEntry(songId, level as PhigrosLevel, diff);

      recommendations.push({
        songId,
        level: level as PhigrosLevel,
        difficulty: diff,
        currentAcc: roundAcc(currentAcc),
        targetAcc: roundAcc(targetAcc),
        accDiff: roundAcc(accDiff),
        currentChartRks: roundAcc(currentChartRks),
        expectedChartRks: roundAcc(expectedChartRks),
        isInBest27,
        rksGain,
        maxPossibleGain: roundRks(maxPossibleGain),
        record: phigrosEntryToScoreRecord(scoredEntry),
      });
    }
  }

  recommendations.sort((a, b) => a.accDiff - b.accDiff || a.difficulty - b.difficulty);
  if (songCost > 1) {
    const joint = jointPlan(baseSims, recommendations, songCost, exactTarget, includePhi);
    return {
      currentRks,
      displayRks,
      exactTarget,
      displayTarget,
      songCost,
      gainNeeded: roundRks(gainNeeded),
      perSongShare: roundRks(perSongShare),
      includePhi,
      combinationReachesTarget: joint.length > 0,
      recommendations: joint,
    };
  }
  let sims = baseSims;
  let running = currentRks;
  let applied = 0;
  for (const candidate of recommendations) {
    if (applied >= songCost) break;
    const next = withReplacedChart(sims, candidate.songId, candidate.level, {
      rks: calculateRks(candidate.difficulty, candidate.targetAcc),
      difficulty: candidate.difficulty,
      isPhi: isAcc100Percent(candidate.targetAcc),
    });
    const finalRks = calculateFinalRks(next);
    if (finalRks <= running + 1e-9) continue;
    sims = next;
    running = finalRks;
    applied += 1;
  }
  const combinationReachesTarget = running + 1e-9 >= exactTarget;

  return {
    currentRks,
    displayRks,
    exactTarget,
    displayTarget,
    songCost,
    gainNeeded: roundRks(gainNeeded),
    perSongShare: roundRks(perSongShare),
    includePhi,
    combinationReachesTarget,
    recommendations,
  };
}

export function formatPushAcc(acc: number): string {
  return acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
}
