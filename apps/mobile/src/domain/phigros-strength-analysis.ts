import type { ScoreRecord } from '@/domain/models';
import {
  phigrosKyouTagsForChart,
  resolvePhigrosKyouPrimaryTags,
  type PhigrosKyouChartTagIndex,
  type PhigrosKyouTag,
  type PhigrosKyouTagType,
} from '@/domain/phigros-kyou';

const INCLUDED_RATES = new Set(['a', 's', 'v', 'phi']);
const FLOATING_FLOOR_EPSILON = 1e-9;

export interface PhigrosStrengthPool {
  threshold: number;
  totalCount: number;
  taggedCount: number;
  averageRks: number | null;
  maxRks: number | null;
}

export interface PhigrosTagRksStat {
  tagId: number;
  name: string;
  type: PhigrosKyouTagType;
  averageRks: number | null;
  deltaFromPoolAverage: number | null;
  sampleCount: number;
  isSmallSample: boolean;
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
};

export function resolvePhigrosStrengthThreshold(playerRks: number): number {
  const safeRks = Number.isFinite(playerRks) ? playerRks : 0;
  return Math.floor((safeRks - 0.2 + FLOATING_FLOOR_EPSILON) * 10) / 10;
}

function statFromAggregate(
  tag: PhigrosKyouTag,
  aggregate: MutableTagAggregate | undefined,
  poolAverage: number | null,
): PhigrosTagRksStat {
  const sampleCount = aggregate?.count ?? 0;
  const averageRks = sampleCount > 0 ? aggregate!.sum / sampleCount : null;
  return {
    tagId: tag.id,
    name: tag.name,
    type: tag.type,
    averageRks,
    deltaFromPoolAverage: averageRks != null && poolAverage != null
      ? averageRks - poolAverage
      : null,
    sampleCount,
    isSmallSample: sampleCount > 0 && sampleCount < 3,
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
  playerRks: number,
  threshold: number,
): { min: number; max: number } {
  const min = Math.max(0, threshold);
  const safePlayerRks = Number.isFinite(playerRks) ? playerRks : min;
  return {
    min,
    max: Math.max(safePlayerRks + 0.2, min + 0.4),
  };
}

export function analyzePhigrosStrength(
  playerRks: number,
  records: readonly ScoreRecord[],
  tagIndex: PhigrosKyouChartTagIndex,
  tagCatalog: readonly PhigrosKyouTag[],
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
  let taggedCount = 0;

  for (const record of poolRecords) {
    const chartTags = phigrosKyouTagsForChart(tagIndex, record.songId, record.levelIndex);
    const primaryTags = resolvePhigrosKyouPrimaryTags(chartTags).tags;
    const secondaryTags = chartTags.filter((tag) => tag.type === 'secondary' && tag.votes > 3);
    const effectiveTags = [...primaryTags, ...secondaryTags];
    if (effectiveTags.length > 0) taggedCount += 1;
    for (const tag of effectiveTags) {
      const aggregate = aggregateByTagId.get(tag.id) ?? { sum: 0, count: 0 };
      aggregate.sum += record.rating;
      aggregate.count += 1;
      aggregateByTagId.set(tag.id, aggregate);
    }
  }

  const primaryCatalog = tagCatalog
    .filter((tag) => tag.type === 'primary')
    .sort((left, right) => left.id - right.id);
  const mainTags = primaryCatalog.map((tag) => (
    statFromAggregate(tag, aggregateByTagId.get(tag.id), poolAverage)
  ));
  const secondaryTags = tagCatalog
    .filter((tag) => tag.type === 'secondary' && aggregateByTagId.has(tag.id))
    .map((tag) => statFromAggregate(tag, aggregateByTagId.get(tag.id), poolAverage))
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
    radarDomain: resolveRadarDomain(playerRks, threshold),
  };
}
