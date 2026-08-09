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
  coefficient: number;
  eligibleChartCount: number;
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
  hasExpectedPrimaryAxes: boolean;
  radarDomain: { min: number; max: number };
}

type MutableTagAggregate = {
  sum: number;
  count: number;
  charts: PhigrosStrengthChartSample[];
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

function statFromAggregate(
  tag: PhigrosKyouTag,
  aggregate: MutableTagAggregate | undefined,
  poolAverage: number | null,
  eligibleChartCount: number,
  maxEligibleChartCount: number,
): PhigrosTagRksStat {
  const sampleCount = aggregate?.count ?? 0;
  const rawAverageRks = sampleCount > 0 ? aggregate!.sum / sampleCount : null;
  const coefficient = resolvePhigrosStrengthAvailabilityCoefficient(
    eligibleChartCount,
    maxEligibleChartCount,
  );
  const averageRks = rawAverageRks == null ? null : rawAverageRks * coefficient;
  return {
    tagId: tag.id,
    name: tag.name,
    type: tag.type,
    rawAverageRks,
    averageRks,
    coefficient,
    eligibleChartCount,
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
    && record.rating >= threshold
    && INCLUDED_RATES.has(record.rate.toLowerCase())
  ));
  const poolSum = poolRecords.reduce((sum, record) => sum + record.rating, 0);
  const poolAverage = poolRecords.length > 0 ? poolSum / poolRecords.length : null;
  const poolMax = poolRecords.length > 0
    ? Math.max(...poolRecords.map((record) => record.rating))
    : null;
  const aggregateByTagId = new Map<number, MutableTagAggregate>();
  const eligibleChartCountByTagId = new Map<number, number>();
  let taggedCount = 0;

  for (const song of catalog.songs) {
    for (const chart of song.charts) {
      if (!Number.isFinite(chart.difficultyConstant) || chart.difficultyConstant < threshold) continue;
      const chartTags = phigrosKyouTagsForChart(tagIndex, song.id, chart.levelIndex);
      for (const tag of effectiveStrengthTags(chartTags)) {
        eligibleChartCountByTagId.set(
          tag.id,
          (eligibleChartCountByTagId.get(tag.id) ?? 0) + 1,
        );
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
  const maxPrimaryEligibleChartCount = Math.max(
    0,
    ...primaryCatalog.map((tag) => eligibleChartCountByTagId.get(tag.id) ?? 0),
  );
  const maxSecondaryEligibleChartCount = Math.max(
    0,
    ...secondaryCatalog.map((tag) => eligibleChartCountByTagId.get(tag.id) ?? 0),
  );
  const mainTags = primaryCatalog.map((tag) => (
    statFromAggregate(
      tag,
      aggregateByTagId.get(tag.id),
      poolAverage,
      eligibleChartCountByTagId.get(tag.id) ?? 0,
      maxPrimaryEligibleChartCount,
    )
  ));
  const secondaryTags = secondaryCatalog
    .filter((tag) => aggregateByTagId.has(tag.id))
    .map((tag) => statFromAggregate(
      tag,
      aggregateByTagId.get(tag.id),
      poolAverage,
      eligibleChartCountByTagId.get(tag.id) ?? 0,
      maxSecondaryEligibleChartCount,
    ))
    .sort(strongestSort);
  const populatedMainTags = mainTags.filter((tag) => tag.averageRks != null);

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
    strongestMainTag: [...populatedMainTags].sort(strongestSort)[0] ?? null,
    weakestMainTag: [...populatedMainTags].sort(weakestSort)[0] ?? null,
    hasExpectedPrimaryAxes: primaryCatalog.length === 5,
    radarDomain: resolveRadarDomain(mainTags, threshold),
  };
}
