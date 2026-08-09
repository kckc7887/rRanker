import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import {
  phigrosKyouTagsForChart,
  resolvePhigrosKyouPrimaryTags,
  type PhigrosKyouChartTagIndex,
  type PhigrosKyouTag,
  type PhigrosKyouTagType,
} from '@/domain/phigros-kyou';

const INCLUDED_RATES = new Set(['a', 's', 'v', 'phi']);
const FLOATING_FLOOR_EPSILON = 1e-9;
const STRENGTH_EQUALITY_EPSILON = 1e-9;
export const PHIGROS_STRENGTH_THRESHOLD_CAP = 16;
export const PHIGROS_STRENGTH_MAX_AVAILABILITY_BONUS = 0.02;

export interface PhigrosStrengthPool {
  threshold: number;
  totalCount: number;
  taggedCount: number;
  averageRks: number | null;
  maxRks: number | null;
}

export interface PhigrosStrengthChartSample {
  songId: string;
  title: string;
  levelIndex: number;
  difficultyConstant: number;
  achievements: number;
  rks: number;
}

export interface PhigrosTagRksStat {
  tagId: number;
  name: string;
  type: PhigrosKyouTagType;
  rawAverageRks: number | null;
  averageRks: number | null;
  countCoefficient: number;
  difficultyCoefficient: number;
  coefficient: number;
  eligibleChartCount: number;
  eligibleAverageDifficulty: number | null;
  sampleCoverage: number;
  deltaFromPoolAverage: number | null;
  sampleCount: number;
  isSmallSample: boolean;
  charts: readonly PhigrosStrengthChartSample[];
}

export interface PhigrosStrengthAnalysis {
  playerRks: number;
  pool: PhigrosStrengthPool;
  mainTags: readonly PhigrosTagRksStat[];
  secondaryTags: readonly PhigrosTagRksStat[];
  strongestMainTag: PhigrosTagRksStat | null;
  weakestMainTag: PhigrosTagRksStat | null;
  areMainTagsTied: boolean;
  hasExpectedPrimaryAxes: boolean;
  radarDomain: { min: number; max: number };
}

type MutableTagAggregate = {
  sum: number;
  count: number;
  charts: PhigrosStrengthChartSample[];
};

type MutableEligibilityAggregate = {
  count: number;
  difficultySum: number;
};

function effectiveStrengthTags(
  chartTags: ReturnType<typeof phigrosKyouTagsForChart>,
): readonly PhigrosKyouTag[] {
  const primaryTags = resolvePhigrosKyouPrimaryTags(chartTags).tags;
  const secondaryTags = chartTags.filter((tag) => tag.type === 'secondary' && tag.votes > 3);
  return [...primaryTags, ...secondaryTags];
}

export function resolvePhigrosStrengthThreshold(playerRks: number): number {
  const safeRks = Number.isFinite(playerRks) ? playerRks : 0;
  const floored = Math.floor((safeRks - 0.2 + FLOATING_FLOOR_EPSILON) * 10) / 10;
  return Math.min(floored, PHIGROS_STRENGTH_THRESHOLD_CAP);
}

export function resolvePhigrosStrengthAvailabilityCoefficient(
  eligibleChartCount: number,
  maxEligibleChartCount: number,
): number {
  if (maxEligibleChartCount <= 0) return 1;
  const normalizedCount = Math.min(
    maxEligibleChartCount,
    Math.max(0, eligibleChartCount),
  ) / maxEligibleChartCount;
  return 1 + PHIGROS_STRENGTH_MAX_AVAILABILITY_BONUS * (1 - normalizedCount);
}

export function resolvePhigrosStrengthDifficultyCoefficient(
  eligibleAverageDifficulty: number | null,
  maxEligibleAverageDifficulty: number,
): number {
  if (eligibleAverageDifficulty == null
    || eligibleAverageDifficulty <= 0
    || maxEligibleAverageDifficulty <= 0) return 1;
  return Math.max(1, maxEligibleAverageDifficulty / eligibleAverageDifficulty);
}

export function resolvePhigrosStrengthCoveredDifficultyCoefficient(
  fullDifficultyCoefficient: number,
  sampleCount: number,
  eligibleChartCount: number,
): number {
  if (eligibleChartCount <= 0) return 1;
  const sampleCoverage = Math.min(1, Math.max(0, sampleCount / eligibleChartCount));
  return 1 + (Math.max(1, fullDifficultyCoefficient) - 1) * sampleCoverage;
}

export function resolvePhigrosStrengthAdjustedRks(
  rawAverageRks: number,
  countCoefficient: number,
  difficultyCoefficient: number,
  perfectBenchmark: number,
): number {
  const difficultyAdjustedRks = rawAverageRks * difficultyCoefficient;
  if (perfectBenchmark <= 0) return difficultyAdjustedRks;
  if (Math.abs(difficultyAdjustedRks - perfectBenchmark) <= STRENGTH_EQUALITY_EPSILON) {
    return perfectBenchmark;
  }
  if (difficultyAdjustedRks >= perfectBenchmark) return difficultyAdjustedRks;
  return Math.min(perfectBenchmark, difficultyAdjustedRks * countCoefficient);
}

function statFromAggregate(
  tag: PhigrosKyouTag,
  aggregate: MutableTagAggregate | undefined,
  poolAverage: number | null,
  eligibleChartCount: number,
  maxEligibleChartCount: number,
  eligibleAverageDifficulty: number | null,
  maxEligibleAverageDifficulty: number,
): PhigrosTagRksStat {
  const sampleCount = aggregate?.count ?? 0;
  const rawAverageRks = sampleCount > 0 ? aggregate!.sum / sampleCount : null;
  const countCoefficient = resolvePhigrosStrengthAvailabilityCoefficient(
    eligibleChartCount,
    maxEligibleChartCount,
  );
  const fullDifficultyCoefficient = resolvePhigrosStrengthDifficultyCoefficient(
    eligibleAverageDifficulty,
    maxEligibleAverageDifficulty,
  );
  const sampleCoverage = eligibleChartCount > 0
    ? Math.min(1, sampleCount / eligibleChartCount)
    : 0;
  const difficultyCoefficient = resolvePhigrosStrengthCoveredDifficultyCoefficient(
    fullDifficultyCoefficient,
    sampleCount,
    eligibleChartCount,
  );
  const averageRks = rawAverageRks == null
    ? null
    : resolvePhigrosStrengthAdjustedRks(
      rawAverageRks,
      countCoefficient,
      difficultyCoefficient,
      maxEligibleAverageDifficulty,
    );
  const coefficient = rawAverageRks != null && rawAverageRks > 0 && averageRks != null
    ? averageRks / rawAverageRks
    : countCoefficient * difficultyCoefficient;
  return {
    tagId: tag.id,
    name: tag.name,
    type: tag.type,
    rawAverageRks,
    averageRks,
    countCoefficient,
    difficultyCoefficient,
    coefficient,
    eligibleChartCount,
    eligibleAverageDifficulty,
    sampleCoverage,
    deltaFromPoolAverage: averageRks != null && poolAverage != null
      ? averageRks - poolAverage
      : null,
    sampleCount,
    isSmallSample: sampleCount > 0 && sampleCount < 3,
    charts: [...(aggregate?.charts ?? [])].sort((left, right) => (
      right.rks - left.rks
      || right.achievements - left.achievements
      || left.songId.localeCompare(right.songId)
      || left.levelIndex - right.levelIndex
    )),
  };
}

function strongestSort(left: PhigrosTagRksStat, right: PhigrosTagRksStat): number {
  return (right.averageRks ?? Number.NEGATIVE_INFINITY)
    - (left.averageRks ?? Number.NEGATIVE_INFINITY)
    || right.sampleCount - left.sampleCount
    || left.tagId - right.tagId;
}

function weakestSort(left: PhigrosTagRksStat, right: PhigrosTagRksStat): number {
  return (left.averageRks ?? Number.POSITIVE_INFINITY)
    - (right.averageRks ?? Number.POSITIVE_INFINITY)
    || right.sampleCount - left.sampleCount
    || left.tagId - right.tagId;
}

function resolveRadarDomain(
  mainTags: readonly PhigrosTagRksStat[],
  threshold: number,
): { min: number; max: number } {
  const min = Math.max(0, threshold);
  const highestTagRks = mainTags.reduce<number | null>((highest, tag) => {
    if (tag.averageRks == null) return highest;
    return highest == null ? tag.averageRks : Math.max(highest, tag.averageRks);
  }, null);
  return {
    min,
    max: Math.max((highestTagRks ?? min) + 0.1, min + 0.1),
  };
}

export function analyzePhigrosStrength(
  playerRks: number,
  records: readonly ScoreRecord[],
  tagIndex: PhigrosKyouChartTagIndex,
  tagCatalog: readonly PhigrosKyouTag[],
  catalog: CatalogSnapshot,
): PhigrosStrengthAnalysis {
  const threshold = resolvePhigrosStrengthThreshold(playerRks);
  const poolRecords = records.filter((record) => (
    Number.isFinite(record.rating)
    && Number.isFinite(record.difficultyConstant)
    && record.difficultyConstant >= threshold
    && INCLUDED_RATES.has(record.rate.toLowerCase())
  ));
  const poolSum = poolRecords.reduce((sum, record) => sum + record.rating, 0);
  const poolAverage = poolRecords.length > 0 ? poolSum / poolRecords.length : null;
  const poolMax = poolRecords.length > 0
    ? Math.max(...poolRecords.map((record) => record.rating))
    : null;
  const aggregateByTagId = new Map<number, MutableTagAggregate>();
  const eligibilityByTagId = new Map<number, MutableEligibilityAggregate>();
  let taggedCount = 0;

  for (const song of catalog.songs) {
    for (const chart of song.charts) {
      if (!Number.isFinite(chart.difficultyConstant) || chart.difficultyConstant < threshold) continue;
      const chartTags = phigrosKyouTagsForChart(tagIndex, song.id, chart.levelIndex);
      for (const tag of effectiveStrengthTags(chartTags)) {
        const eligibility = eligibilityByTagId.get(tag.id) ?? { count: 0, difficultySum: 0 };
        eligibility.count += 1;
        eligibility.difficultySum += chart.difficultyConstant;
        eligibilityByTagId.set(tag.id, eligibility);
      }
    }
  }

  for (const record of poolRecords) {
    const chartTags = phigrosKyouTagsForChart(tagIndex, record.songId, record.levelIndex);
    const effectiveTags = effectiveStrengthTags(chartTags);
    if (effectiveTags.length > 0) taggedCount += 1;
    for (const tag of effectiveTags) {
      const aggregate = aggregateByTagId.get(tag.id) ?? { sum: 0, count: 0, charts: [] };
      aggregate.sum += record.rating;
      aggregate.count += 1;
      aggregate.charts.push({
        songId: record.songId,
        title: record.title,
        levelIndex: record.levelIndex,
        difficultyConstant: record.difficultyConstant,
        achievements: record.achievements,
        rks: record.rating,
      });
      aggregateByTagId.set(tag.id, aggregate);
    }
  }

  const primaryCatalog = tagCatalog
    .filter((tag) => tag.type === 'primary')
    .sort((left, right) => left.id - right.id);
  const secondaryCatalog = tagCatalog.filter((tag) => tag.type === 'secondary');
  const eligibleCount = (tagId: number) => eligibilityByTagId.get(tagId)?.count ?? 0;
  const eligibleAverageDifficulty = (tagId: number) => {
    const eligibility = eligibilityByTagId.get(tagId);
    return eligibility && eligibility.count > 0
      ? eligibility.difficultySum / eligibility.count
      : null;
  };
  const maxPrimaryEligibleChartCount = Math.max(
    0,
    ...primaryCatalog.map((tag) => eligibleCount(tag.id)),
  );
  const maxSecondaryEligibleChartCount = Math.max(
    0,
    ...secondaryCatalog.map((tag) => eligibleCount(tag.id)),
  );
  const maxPrimaryEligibleAverageDifficulty = Math.max(
    0,
    ...primaryCatalog.map((tag) => eligibleAverageDifficulty(tag.id) ?? 0),
  );
  const maxSecondaryEligibleAverageDifficulty = Math.max(
    0,
    ...secondaryCatalog.map((tag) => eligibleAverageDifficulty(tag.id) ?? 0),
  );
  const mainTags = primaryCatalog.map((tag) => (
    statFromAggregate(
      tag,
      aggregateByTagId.get(tag.id),
      poolAverage,
      eligibleCount(tag.id),
      maxPrimaryEligibleChartCount,
      eligibleAverageDifficulty(tag.id),
      maxPrimaryEligibleAverageDifficulty,
    )
  ));
  const secondaryTags = secondaryCatalog
    .filter((tag) => aggregateByTagId.has(tag.id))
    .map((tag) => statFromAggregate(
      tag,
      aggregateByTagId.get(tag.id),
      poolAverage,
      eligibleCount(tag.id),
      maxSecondaryEligibleChartCount,
      eligibleAverageDifficulty(tag.id),
      maxSecondaryEligibleAverageDifficulty,
    ))
    .sort(strongestSort);
  const populatedMainTags = mainTags.filter((tag) => tag.averageRks != null);
  const areMainTagsTied = populatedMainTags.length === primaryCatalog.length
    && populatedMainTags.length > 1
    && populatedMainTags.every((tag) => (
      Math.abs(tag.averageRks! - populatedMainTags[0]!.averageRks!) <= STRENGTH_EQUALITY_EPSILON
    ));

  return {
    playerRks,
    pool: {
      threshold,
      totalCount: poolRecords.length,
      taggedCount,
      averageRks: poolAverage,
      maxRks: poolMax,
    },
    mainTags,
    secondaryTags,
    strongestMainTag: areMainTagsTied ? null : [...populatedMainTags].sort(strongestSort)[0] ?? null,
    weakestMainTag: areMainTagsTied ? null : [...populatedMainTags].sort(weakestSort)[0] ?? null,
    areMainTagsTied,
    hasExpectedPrimaryAxes: primaryCatalog.length === 5,
    radarDomain: resolveRadarDomain(mainTags, threshold),
  };
}
