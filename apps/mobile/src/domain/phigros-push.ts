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
  /** 该曲提升后对总 RKS 的增益（应 ≥ perSongShare） */
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
 * 推分推荐：将精确加值均摊到 songCost 首歌，每首歌只需把总 RKS 抬高 perSongShare。
 * 对每张候选谱面二分 Acc，按 Acc 差值升序返回全部可达谱面。
 */
export function findPushRecommendations(
  gameRecord: Record<string, (PhigrosScoreEntry | null)[]>,
  difficultyTable: PhigrosDifficultyTable,
  options: { delta: number; songCost: number },
): PushRecommendationsResult {
  const songCost = Math.max(1, Math.floor(options.songCost));
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
  // 份额极小时用一个下限，避免浮点噪声；正常按份额判断可行性
  const minGainGate = Math.max(perSongShare * 0.99, 1e-6);

  for (const [songId, levels] of Object.entries(gameRecord)) {
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

  return {
    currentRks,
    displayRks,
    exactTarget,
    displayTarget,
    songCost,
    gainNeeded: roundRks(gainNeeded),
    perSongShare: roundRks(perSongShare),
    recommendations,
  };
}

export function formatPushAcc(acc: number): string {
  return acc % 1 === 0 ? `${acc.toFixed(0)}%` : `${acc.toFixed(2)}%`;
}
