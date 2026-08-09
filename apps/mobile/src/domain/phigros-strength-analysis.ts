import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import { calculateRks } from '@/domain/phigros';
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
export const PHIGROS_STRENGTH_MAX_ANALYSIS_SUPPLEMENTS_PER_TAG = 5;
export const PHIGROS_STRENGTH_RECOMMENDATION_COUNT = 3;
export const PHIGROS_STRENGTH_RECOMMENDATION_MIN_GAIN = 0.0001;

export interface PhigrosStrengthPool {
  threshold: number;
  baseCount: number;
  supplementedCount: number;
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
  isSupplemental: boolean;
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
  supplementedSampleCount: number;
  eligibleAverageDifficulty: number | null;
  sampleCoverage: number;
  deltaFromPoolAverage: number | null;
  sampleCount: number;
  isSmallSample: boolean;
  charts: readonly PhigrosStrengthChartSample[];
}

export interface PhigrosStrengthRecommendation {
  tagId: number;
  tagName: string;
  songId: string;
  title: string;
  levelIndex: number;
  difficultyConstant: number;
  currentAcc: number | null;
  currentRks: number | null;
  targetAcc: number;
  targetRks: number;
  projectedTagRks: number;
  projectedGain: number;
}

export interface PhigrosStrengthAnalysis {
  playerRks: number;
  pool: PhigrosStrengthPool;
  mainTags: readonly PhigrosTagRksStat[];
  mainTagProfileLabel: string;
  secondaryTags: readonly PhigrosTagRksStat[];
  strongestMainTag: PhigrosTagRksStat | null;
  weakestMainTag: PhigrosTagRksStat | null;
  recommendations: readonly PhigrosStrengthRecommendation[];
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

function strengthChartKey(songId: string, levelIndex: number): string {
  return `${songId}\u0000${levelIndex}`;
}

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
  supplementedSampleCount: number,
  eligibleAverageDifficulty: number | null,
  maxEligibleAverageDifficulty: number,
): PhigrosTagRksStat {
  const sampleCount = aggregate?.count ?? 0;
  const isSmallSample = sampleCount > 0 && sampleCount < 3;
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
    supplementedSampleCount,
    eligibleAverageDifficulty,
    sampleCoverage,
    deltaFromPoolAverage: averageRks != null && poolAverage != null
      ? averageRks - poolAverage
      : null,
    sampleCount,
    isSmallSample,
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

export function resolvePhigrosStrengthProfileLabel(
  tags: readonly Pick<PhigrosTagRksStat, 'tagId' | 'name' | 'sampleCoverage'>[],
): string {
  const coverages = tags.map((tag) => ({
    ...tag,
    coverage: Number.isFinite(tag.sampleCoverage) ? Math.max(0, tag.sampleCoverage) : 0,
  }));
  const coverageTotal = coverages.reduce((sum, tag) => sum + tag.coverage, 0);
  if (coverageTotal <= 0) return '主标签暂无评价';
  const ranked = coverages
    .map((tag) => ({ ...tag, share: tag.coverage / coverageTotal }))
    .sort((left, right) => right.share - left.share || left.tagId - right.tagId);
  const highestShare = ranked[0]!.share;
  const lowestShare = ranked.at(-1)!.share;
  if (tags.length === 5
    && ranked.every((tag) => tag.coverage > 0)
    && highestShare - lowestShare <= 0.08) {
    return '五维均衡型';
  }
  const first = ranked[0]!;
  const second = ranked[1];
  if (second && first.share + second.share >= 0.6 && second.share >= 0.24) {
    return `${first.name}·${second.name}双核型`;
  }
  if (first.share >= 0.4 || first.share - (second?.share ?? 0) >= 0.15) {
    return `${first.name}特化型`;
  }
  return `${first.name}倾向型`;
}

function minimumAccForProjectedGain(
  difficultyConstant: number,
  currentAcc: number | null,
  projectTagRks: (chartRks: number, targetAcc: number) => number,
  currentTagRks: number,
): { targetAcc: number; targetRks: number; projectedTagRks: number } | null {
  const minimumAccUnits = currentAcc == null
    ? 7_000
    : Math.max(7_000, Math.floor((currentAcc + FLOATING_FLOOR_EPSILON) * 100) + 1);
  if (minimumAccUnits > 10_000) return null;
  const targetTagRks = currentTagRks + PHIGROS_STRENGTH_RECOMMENDATION_MIN_GAIN;
  const projectsEnoughGain = (accUnits: number) => {
    const targetAcc = accUnits / 100;
    return projectTagRks(calculateRks(difficultyConstant, targetAcc), targetAcc)
      + STRENGTH_EQUALITY_EPSILON >= targetTagRks;
  };
  if (!projectsEnoughGain(10_000)) return null;

  let low = minimumAccUnits;
  let high = 10_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (projectsEnoughGain(middle)) high = middle;
    else low = middle + 1;
  }
  const targetAcc = low / 100;
  const targetRks = calculateRks(difficultyConstant, targetAcc);
  return { targetAcc, targetRks, projectedTagRks: projectTagRks(targetRks, targetAcc) };
}

function resolvePhigrosStrengthRecommendations(
  weakestTag: PhigrosTagRksStat | null,
  playerRks: number,
  records: readonly ScoreRecord[],
  tagIndex: PhigrosKyouChartTagIndex,
  tagCatalog: readonly PhigrosKyouTag[],
  catalog: CatalogSnapshot,
  threshold: number,
): readonly PhigrosStrengthRecommendation[] {
  if (!weakestTag || weakestTag.averageRks == null || weakestTag.rawAverageRks == null) return [];
  const recordsByChart = new Map<string, ScoreRecord>();
  for (const record of records) {
    const key = strengthChartKey(record.songId, record.levelIndex);
    const current = recordsByChart.get(key);
    if (!current || record.rating > current.rating
      || (record.rating === current.rating && record.achievements > current.achievements)) {
      recordsByChart.set(key, record);
    }
  }
  const candidates = catalog.songs.flatMap((song) => song.charts
    .filter((chart) => (
      Number.isFinite(chart.difficultyConstant)
      && chart.difficultyConstant >= threshold
      && effectiveStrengthTags(
        phigrosKyouTagsForChart(tagIndex, song.id, chart.levelIndex),
      ).some((tag) => tag.id === weakestTag.tagId)
    ))
    .map((chart) => ({ song, chart })))
    .sort((left, right) => (
      left.chart.difficultyConstant - right.chart.difficultyConstant
      || left.song.id.localeCompare(right.song.id)
      || left.chart.levelIndex - right.chart.levelIndex
    ));

  const recommendations: PhigrosStrengthRecommendation[] = [];
  let candidateIndex = 0;
  while (candidateIndex < candidates.length) {
    const groupDifficulty = candidates[candidateIndex]!.chart.difficultyConstant;
    const sameDifficultyCandidates = [];
    while (candidateIndex < candidates.length
      && candidates[candidateIndex]!.chart.difficultyConstant === groupDifficulty) {
      sameDifficultyCandidates.push(candidates[candidateIndex]!);
      candidateIndex += 1;
    }
    for (const { song, chart } of sameDifficultyCandidates) {
      const key = strengthChartKey(song.id, chart.levelIndex);
      const currentRecord = recordsByChart.get(key);
      const projectTagRks = (chartRks: number, targetAcc: number) => {
        const hypotheticalRecord: ScoreRecord = currentRecord
          ? { ...currentRecord, achievements: targetAcc, rating: chartRks, rate: targetAcc >= 100 ? 'phi' : 'a' }
          : {
            songId: song.id,
            title: song.title,
            type: chart.type,
            levelIndex: chart.levelIndex,
            level: chart.level,
            difficulty: chart.difficulty,
            difficultyConstant: chart.difficultyConstant,
            achievements: targetAcc,
            dxScore: null,
            rating: chartRks,
            fc: null,
            fs: null,
            rate: targetAcc >= 100 ? 'phi' : 'a',
            version: song.version,
          };
        const hypotheticalRecords = records
          .filter((record) => strengthChartKey(record.songId, record.levelIndex) !== key)
          .concat(hypotheticalRecord);
        return analyzePhigrosStrengthInternal(
          playerRks,
          hypotheticalRecords,
          tagIndex,
          tagCatalog,
          catalog,
          false,
        ).mainTags.find((tag) => tag.tagId === weakestTag.tagId)?.averageRks
          ?? Number.NEGATIVE_INFINITY;
      };
      const target = minimumAccForProjectedGain(
        chart.difficultyConstant,
        currentRecord?.achievements ?? null,
        projectTagRks,
        weakestTag.averageRks,
      );
      if (!target) continue;
      recommendations.push({
        tagId: weakestTag.tagId,
        tagName: weakestTag.name,
        songId: song.id,
        title: song.title,
        levelIndex: chart.levelIndex,
        difficultyConstant: chart.difficultyConstant,
        currentAcc: currentRecord?.achievements ?? null,
        currentRks: currentRecord?.rating ?? null,
        targetAcc: target.targetAcc,
        targetRks: target.targetRks,
        projectedTagRks: target.projectedTagRks,
        projectedGain: target.projectedTagRks - weakestTag.averageRks,
      });
    }
    if (recommendations.length >= PHIGROS_STRENGTH_RECOMMENDATION_COUNT) break;
  }

  return recommendations
    .sort((left, right) => (
      left.difficultyConstant - right.difficultyConstant
      || left.targetAcc - right.targetAcc
      || left.songId.localeCompare(right.songId)
      || left.levelIndex - right.levelIndex
    ))
    .slice(0, PHIGROS_STRENGTH_RECOMMENDATION_COUNT);
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

function analyzePhigrosStrengthInternal(
  playerRks: number,
  records: readonly ScoreRecord[],
  tagIndex: PhigrosKyouChartTagIndex,
  tagCatalog: readonly PhigrosKyouTag[],
  catalog: CatalogSnapshot,
  includeRecommendations: boolean,
): PhigrosStrengthAnalysis {
  const threshold = resolvePhigrosStrengthThreshold(playerRks);
  const basePoolRecords = records.filter((record) => (
    Number.isFinite(record.rating)
    && record.rating >= threshold
    && INCLUDED_RATES.has(record.rate.toLowerCase())
  ));
  const aggregateByTagId = new Map<number, MutableTagAggregate>();
  const eligibilityByTagId = new Map<number, MutableEligibilityAggregate>();
  const supplementedSampleCountByTagId = new Map<number, number>();
  const candidateChartKeys = new Set<string>();

  for (const song of catalog.songs) {
    for (const chart of song.charts) {
      if (!Number.isFinite(chart.difficultyConstant) || chart.difficultyConstant < threshold) continue;
      candidateChartKeys.add(strengthChartKey(song.id, chart.levelIndex));
      const chartTags = phigrosKyouTagsForChart(tagIndex, song.id, chart.levelIndex);
      for (const tag of effectiveStrengthTags(chartTags)) {
        const eligibility = eligibilityByTagId.get(tag.id) ?? { count: 0, difficultySum: 0 };
        eligibility.count += 1;
        eligibility.difficultySum += chart.difficultyConstant;
        eligibilityByTagId.set(tag.id, eligibility);
      }
    }
  }

  const addRecordToTag = (
    record: ScoreRecord,
    tag: PhigrosKyouTag,
    isSupplemental: boolean,
  ) => {
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
      isSupplemental,
    });
    aggregateByTagId.set(tag.id, aggregate);
  };

  const aggregateRecords = (poolRecords: readonly ScoreRecord[], supplementalKeys: ReadonlySet<string>) => {
    aggregateByTagId.clear();
    supplementedSampleCountByTagId.clear();
    for (const record of poolRecords) {
      const key = strengthChartKey(record.songId, record.levelIndex);
      const isSupplemental = supplementalKeys.has(key);
      const effectiveTags = effectiveStrengthTags(
        phigrosKyouTagsForChart(tagIndex, record.songId, record.levelIndex),
      );
      for (const tag of effectiveTags) {
        addRecordToTag(record, tag, isSupplemental);
        if (isSupplemental) {
          supplementedSampleCountByTagId.set(
            tag.id,
            (supplementedSampleCountByTagId.get(tag.id) ?? 0) + 1,
          );
        }
      }
    }
  };

  aggregateRecords(basePoolRecords, new Set());
  const smallSampleTagIds = new Set(
    [...aggregateByTagId.entries()]
      .filter(([, aggregate]) => aggregate.count > 0 && aggregate.count < 3)
      .map(([tagId]) => tagId),
  );
  const basePoolRecordKeys = new Set(
    basePoolRecords.map((record) => strengthChartKey(record.songId, record.levelIndex)),
  );
  const selectedSupplementKeysByTagId = new Map<number, Set<string>>();
  const selectedSupplementTagIdsByKey = new Map<string, Set<number>>();
  const supplementalPoolRecords = new Map<string, ScoreRecord>();
  const supplementalCandidates = records
    .filter((record) => {
      const key = strengthChartKey(record.songId, record.levelIndex);
      return Number.isFinite(record.rating)
        && candidateChartKeys.has(key)
        && !basePoolRecordKeys.has(key);
    })
    .sort((left, right) => (
      right.rating - left.rating
      || right.achievements - left.achievements
      || left.songId.localeCompare(right.songId)
      || left.levelIndex - right.levelIndex
    ));

  for (const record of supplementalCandidates) {
    const key = strengthChartKey(record.songId, record.levelIndex);
    const chartTags = phigrosKyouTagsForChart(tagIndex, record.songId, record.levelIndex);
    const effectiveTags = effectiveStrengthTags(chartTags);
    for (const tag of effectiveTags) {
      if (!smallSampleTagIds.has(tag.id)) continue;
      const selectedKeys = selectedSupplementKeysByTagId.get(tag.id) ?? new Set<string>();
      if (selectedKeys.size >= PHIGROS_STRENGTH_MAX_ANALYSIS_SUPPLEMENTS_PER_TAG) continue;
      if (selectedKeys.has(key)) continue;
      selectedKeys.add(key);
      selectedSupplementKeysByTagId.set(tag.id, selectedKeys);
      const selectedTagIds = selectedSupplementTagIdsByKey.get(key) ?? new Set<number>();
      selectedTagIds.add(tag.id);
      selectedSupplementTagIdsByKey.set(key, selectedTagIds);
      supplementalPoolRecords.set(key, record);
    }
  }

  const poolRecords = [...basePoolRecords, ...supplementalPoolRecords.values()];
  for (const [key, record] of supplementalPoolRecords) {
    const selectedTagIds = selectedSupplementTagIdsByKey.get(key) ?? new Set<number>();
    const effectiveTags = effectiveStrengthTags(
      phigrosKyouTagsForChart(tagIndex, record.songId, record.levelIndex),
    );
    for (const tag of effectiveTags) {
      if (!selectedTagIds.has(tag.id)) continue;
      addRecordToTag(record, tag, true);
      supplementedSampleCountByTagId.set(
        tag.id,
        (supplementedSampleCountByTagId.get(tag.id) ?? 0) + 1,
      );
    }
  }
  const poolSum = poolRecords.reduce((sum, record) => sum + record.rating, 0);
  const poolAverage = poolRecords.length > 0 ? poolSum / poolRecords.length : null;
  const poolMax = poolRecords.length > 0
    ? Math.max(...poolRecords.map((record) => record.rating))
    : null;
  const taggedCount = poolRecords.reduce((count, record) => (
    effectiveStrengthTags(
      phigrosKyouTagsForChart(tagIndex, record.songId, record.levelIndex),
    ).length > 0 ? count + 1 : count
  ), 0);

  const primaryCatalog = tagCatalog
    .filter((tag) => tag.type === 'primary')
    .sort((left, right) => left.id - right.id);
  const secondaryCatalog = tagCatalog.filter((tag) => tag.type === 'secondary');
  const eligibleCount = (tagId: number) => eligibilityByTagId.get(tagId)?.count ?? 0;
  const supplementedSampleCount = (tagId: number) => supplementedSampleCountByTagId.get(tagId) ?? 0;
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
      supplementedSampleCount(tag.id),
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
      supplementedSampleCount(tag.id),
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
  const strongestMainTag = areMainTagsTied
    ? null
    : [...populatedMainTags].sort(strongestSort)[0] ?? null;
  const weakestMainTag = areMainTagsTied
    ? null
    : [...populatedMainTags].sort(weakestSort)[0] ?? null;
  const recommendations = includeRecommendations
    ? resolvePhigrosStrengthRecommendations(
      weakestMainTag,
      playerRks,
      records,
      tagIndex,
      tagCatalog,
      catalog,
      threshold,
    )
    : [];

  return {
    playerRks,
    pool: {
      threshold,
      baseCount: basePoolRecords.length,
      supplementedCount: supplementalPoolRecords.size,
      totalCount: poolRecords.length,
      taggedCount,
      averageRks: poolAverage,
      maxRks: poolMax,
    },
    mainTags,
    mainTagProfileLabel: resolvePhigrosStrengthProfileLabel(mainTags),
    secondaryTags,
    strongestMainTag,
    weakestMainTag,
    recommendations,
    areMainTagsTied,
    hasExpectedPrimaryAxes: primaryCatalog.length === 5,
    radarDomain: resolveRadarDomain(mainTags, threshold),
  };
}

export function analyzePhigrosStrength(
  playerRks: number,
  records: readonly ScoreRecord[],
  tagIndex: PhigrosKyouChartTagIndex,
  tagCatalog: readonly PhigrosKyouTag[],
  catalog: CatalogSnapshot,
): PhigrosStrengthAnalysis {
  return analyzePhigrosStrengthInternal(
    playerRks,
    records,
    tagIndex,
    tagCatalog,
    catalog,
    true,
  );
}
