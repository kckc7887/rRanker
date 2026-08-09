import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import type {
  PhigrosKyouChartTagIndex,
  PhigrosKyouResolvedTag,
  PhigrosKyouTag,
} from '@/domain/phigros-kyou';
import {
  analyzePhigrosStrength,
  resolvePhigrosStrengthAdjustedRks,
  resolvePhigrosStrengthAvailabilityCoefficient,
  resolvePhigrosStrengthCoveredDifficultyCoefficient,
  resolvePhigrosStrengthDifficultyCoefficient,
  resolvePhigrosStrengthProfileLabel,
  resolvePhigrosStrengthThreshold,
} from '@/domain/phigros-strength-analysis';
import { calculateRks } from '@/domain/phigros';
import { chartVersionKey } from '@/domain/catalog';

const primaryTags: PhigrosKyouTag[] = [
  { id: 1, name: '读谱', type: 'primary', parentIds: [], description: '' },
  { id: 2, name: '耐力', type: 'primary', parentIds: [], description: '' },
  { id: 3, name: '协调', type: 'primary', parentIds: [], description: '' },
  { id: 4, name: '手速', type: 'primary', parentIds: [], description: '' },
  { id: 5, name: '多指', type: 'primary', parentIds: [], description: '' },
];
const secondaryTags: PhigrosKyouTag[] = [
  { id: 10, name: '差速', type: 'secondary', parentIds: [1], description: '' },
  { id: 11, name: '脑裂', type: 'secondary', parentIds: [1], description: '' },
];

function score(songId: string, levelIndex: number, rating: number, rate: string): ScoreRecord {
  return {
    songId,
    title: songId,
    type: 'SD',
    levelIndex,
    level: ['EZ', 'HD', 'IN', 'AT'][levelIndex]!,
    difficulty: 'master',
    difficultyConstant: 16,
    achievements: 98,
    dxScore: 980000,
    rating,
    fc: null,
    fs: null,
    rate,
    version: 'current',
  };
}

function resolved(tag: PhigrosKyouTag, votes: number): PhigrosKyouResolvedTag {
  return { ...tag, votes };
}

function catalog(charts: readonly [songId: string, levelIndex: number, constant: number][]): CatalogSnapshot {
  return {
    currentVersion: { id: 1, title: 'current' },
    versions: [{ id: 1, title: 'current' }],
    songs: charts.map(([songId, levelIndex, difficultyConstant]) => ({
      id: songId,
      title: songId,
      version: 'current',
      charts: [{
        songId,
        type: 'SD',
        levelIndex,
        level: ['EZ', 'HD', 'IN', 'AT'][levelIndex]!,
        difficulty: 'master',
        difficultyConstant,
      }],
    })),
    chartVersionIndex: {},
    source: {
      kind: 'local',
      label: 'test',
      updatedAt: '2026-08-09T00:00:00.000Z',
      isStale: false,
    },
  };
}

describe('Phigros strength analysis', () => {
  it('floors player RKS minus 0.2 to one decimal without boundary drift', () => {
    expect(resolvePhigrosStrengthThreshold(16.1691)).toBe(15.9);
    expect(resolvePhigrosStrengthThreshold(15.3)).toBe(15.1);
    expect(resolvePhigrosStrengthThreshold(16.3)).toBe(16);
    expect(resolvePhigrosStrengthThreshold(17)).toBe(16);
    expect(resolvePhigrosStrengthThreshold(0)).toBe(-0.2);
  });

  it('scales availability coefficients from 1.0000 to 1.0200', () => {
    expect(resolvePhigrosStrengthAvailabilityCoefficient(10, 10)).toBe(1);
    expect(resolvePhigrosStrengthAvailabilityCoefficient(5, 10)).toBeCloseTo(1.01, 10);
    expect(resolvePhigrosStrengthAvailabilityCoefficient(0, 10)).toBeCloseTo(1.02, 10);
    expect(resolvePhigrosStrengthAvailabilityCoefficient(0, 0)).toBe(1);
    expect(resolvePhigrosStrengthDifficultyCoefficient(16.9, 16.9)).toBe(1);
    expect(resolvePhigrosStrengthDifficultyCoefficient(16.3, 16.9)).toBeCloseTo(16.9 / 16.3, 10);
    expect(resolvePhigrosStrengthDifficultyCoefficient(null, 16.9)).toBe(1);
    expect(resolvePhigrosStrengthCoveredDifficultyCoefficient(1.0448, 2, 9)).toBeCloseTo(
      1 + 0.0448 * 2 / 9,
      10,
    );
    expect(resolvePhigrosStrengthCoveredDifficultyCoefficient(1.0448, 9, 9)).toBeCloseTo(1.0448, 10);
    expect(resolvePhigrosStrengthCoveredDifficultyCoefficient(1.0448, 0, 0)).toBe(1);
    expect(resolvePhigrosStrengthAdjustedRks(15.5, 1.015, 1, 16)).toBeCloseTo(15.7325, 10);
    expect(resolvePhigrosStrengthAdjustedRks(16, 1.015, 1, 16)).toBe(16);
    expect(resolvePhigrosStrengthAdjustedRks(16.1, 1.015, 1, 16)).toBe(16.1);
  });

  it('describes main-tag coverage shares as balanced, dual-core, specialized or leaning', () => {
    const profile = (coverages: readonly number[]) => resolvePhigrosStrengthProfileLabel(
      primaryTags.map((tag, index) => ({
        tagId: tag.id,
        name: tag.name,
        sampleCoverage: coverages[index] ?? 0,
      })),
    );

    expect(profile([1, 1, 1, 1, 1])).toBe('五维均衡型');
    expect(profile([1, 1, 0, 0, 0])).toBe('读谱·耐力双核型');
    expect(profile([1, 0.2, 0.1, 0.05, 0.05])).toBe('读谱特化型');
    expect(profile([0.8, 0.7, 0.6, 0.5, 0.4])).toBe('读谱倾向型');
    expect(profile([0, 0, 0, 0, 0])).toBe('主标签暂无评价');
  });

  it('builds a per-chart pool and averages effective primary and secondary tags', () => {
    const index: PhigrosKyouChartTagIndex = new Map([
      [chartVersionKey('same-song', 'SD', 2), [
        resolved(primaryTags[0]!, 30),
        resolved(primaryTags[1]!, 10),
        resolved(secondaryTags[0]!, 4),
        resolved(secondaryTags[1]!, 3),
      ]],
      [chartVersionKey('same-song', 'SD', 3), [
        resolved(primaryTags[0]!, 20),
        resolved(primaryTags[1]!, 21),
        resolved(primaryTags[2]!, 0),
      ]],
    ]);
    const analysis = analyzePhigrosStrength(16.1691, [
      score('same-song', 2, 15.9, 'a'),
      score('same-song', 3, 16.1, 's'),
      score('excluded-b', 2, 16.4, 'b'),
      score('untagged', 2, 16.2, 'v'),
      score('below-threshold', 2, 15.8999, 'phi'),
    ], index, [...primaryTags, ...secondaryTags], catalog([
      ['same-song', 2, 16],
      ['same-song', 3, 16.2],
    ]));

    expect(analysis.pool).toMatchObject({
      threshold: 15.9,
      totalCount: 3,
      taggedCount: 2,
      maxRks: 16.2,
    });
    expect(analysis.pool.averageRks).toBeCloseTo((15.9 + 16.1 + 16.2) / 3, 8);
    expect(analysis.hasExpectedPrimaryAxes).toBe(true);
    expect(analysis.mainTags.map((tag) => [
      tag.name,
      tag.rawAverageRks,
      tag.countCoefficient,
      tag.eligibleChartCount,
      tag.eligibleAverageDifficulty,
      tag.sampleCount,
    ])).toEqual([
      ['读谱', 16, 1, 2, 16.1, 2],
      ['耐力', 16.1, 1.01, 1, 16.2, 1],
      ['协调', null, 1.02, 0, null, 0],
      ['手速', null, 1.02, 0, null, 0],
      ['多指', null, 1.02, 0, null, 0],
    ]);
    expect(analysis.mainTags[0]!.difficultyCoefficient).toBeCloseTo(16.2 / 16.1, 8);
    expect(analysis.mainTags[0]!.coefficient).toBeCloseTo(16.2 / 16.1, 8);
    expect(analysis.mainTags[0]!.averageRks).toBeCloseTo(16 * 16.2 / 16.1, 8);
    expect(analysis.mainTags[1]!.coefficient).toBeCloseTo(16.2 / 16.1, 8);
    expect(analysis.mainTags[1]!.averageRks).toBeCloseTo(16.2, 8);
    expect(analysis.strongestMainTag?.name).toBe('耐力');
    expect(analysis.weakestMainTag?.name).toBe('读谱');
    expect(analysis.radarDomain.min).toBe(15.9);
    expect(analysis.radarDomain.max).toBeCloseTo(16.3, 8);
    expect(analysis.mainTags[0]!.charts.map((chart) => [chart.levelIndex, chart.rks])).toEqual([
      [3, 16.1],
      [2, 15.9],
    ]);
    expect(analysis.secondaryTags).toHaveLength(1);
    expect(analysis.secondaryTags[0]).toMatchObject({
      name: '差速',
      rawAverageRks: 15.9,
      averageRks: 15.9,
      coefficient: 1,
      countCoefficient: 1,
      difficultyCoefficient: 1,
      eligibleChartCount: 1,
      eligibleAverageDifficulty: 16,
      sampleCount: 1,
      isSmallSample: true,
    });
  });

  it('keeps unplayed candidates and supplements a scored failed grade', () => {
    const index: PhigrosKyouChartTagIndex = new Map([
      [chartVersionKey('rare-played', 'SD', 2), [
        resolved(primaryTags[0]!, 20),
        resolved(secondaryTags[0]!, 4),
      ]],
      [chartVersionKey('common-played', 'SD', 2), [resolved(primaryTags[1]!, 20)]],
      [chartVersionKey('common-failed', 'SD', 2), [resolved(primaryTags[1]!, 20)]],
      [chartVersionKey('common-unplayed-1', 'SD', 2), [resolved(primaryTags[1]!, 20)]],
      [chartVersionKey('common-unplayed-2', 'SD', 2), [resolved(primaryTags[1]!, 20)]],
    ]);
    const analysis = analyzePhigrosStrength(16.2, [
      score('rare-played', 2, 16, 'a'),
      score('common-played', 2, 16, 'a'),
      score('common-failed', 2, 16, 'b'),
    ], index, [...primaryTags, ...secondaryTags], catalog([
      ['rare-played', 2, 16],
      ['common-played', 2, 16],
      ['common-failed', 2, 16],
      ['common-unplayed-1', 2, 16],
      ['common-unplayed-2', 2, 16],
    ]));

    expect(analysis.pool).toMatchObject({
      baseCount: 2,
      supplementedCount: 1,
      totalCount: 3,
    });
    expect(analysis.mainTags[0]).toMatchObject({
      rawAverageRks: 16,
      averageRks: 16,
      coefficient: 1,
      countCoefficient: 1.015,
      eligibleChartCount: 1,
      sampleCount: 1,
    });
    expect(analysis.mainTags[1]).toMatchObject({
      rawAverageRks: 16,
      averageRks: 16,
      coefficient: 1,
      eligibleChartCount: 4,
      sampleCount: 2,
      supplementedSampleCount: 1,
    });
    expect(analysis.mainTags[0]!.averageRks).toBeCloseTo(analysis.mainTags[1]!.averageRks!, 8);
    expect(analysis.secondaryTags[0]).toMatchObject({
      name: '差速',
      coefficient: 1,
      eligibleChartCount: 1,
      sampleCount: 1,
    });
  });

  it('adds up to five scored candidate charts to a small analysis sample without changing scarcity inputs', () => {
    const index = new Map<string, PhigrosKyouResolvedTag[]>();
    const catalogCharts: [songId: string, levelIndex: number, constant: number][] = [];
    index.set(chartVersionKey('rare-played', 'SD', 2), [resolved(primaryTags[0]!, 20)]);
    catalogCharts.push(['rare-played', 2, 16]);
    for (let chartIndex = 0; chartIndex < 7; chartIndex += 1) {
      const songId = `rare-candidate-${chartIndex}`;
      index.set(chartVersionKey(songId, 'SD', 2), [resolved(primaryTags[0]!, 20)]);
      catalogCharts.push([songId, 2, 16]);
    }
    index.set(chartVersionKey('rare-unplayed', 'SD', 2), [resolved(primaryTags[0]!, 20)]);
    catalogCharts.push(['rare-unplayed', 2, 16]);
    index.set(chartVersionKey('rare-outside-candidate', 'SD', 2), [resolved(primaryTags[0]!, 20)]);
    catalogCharts.push(['rare-outside-candidate', 2, 15.9]);
    for (let chartIndex = 0; chartIndex < 10; chartIndex += 1) {
      const songId = `common-${chartIndex}`;
      index.set(chartVersionKey(songId, 'SD', 2), [resolved(primaryTags[1]!, 20)]);
      catalogCharts.push([songId, 2, 16]);
    }
    for (let chartIndex = 0; chartIndex < 3; chartIndex += 1) {
      const songId = `enough-${chartIndex}`;
      index.set(chartVersionKey(songId, 'SD', 2), [resolved(primaryTags[2]!, 20)]);
      catalogCharts.push([songId, 2, 16]);
    }
    for (let chartIndex = 0; chartIndex < 6; chartIndex += 1) {
      const songId = `enough-candidate-${chartIndex}`;
      index.set(chartVersionKey(songId, 'SD', 2), [resolved(primaryTags[2]!, 20)]);
      catalogCharts.push([songId, 2, 16]);
    }

    const analysis = analyzePhigrosStrength(17, [
      score('rare-played', 2, 16, 'a'),
      ...Array.from({ length: 7 }, (_, chartIndex) => (
        score(`rare-candidate-${chartIndex}`, 2, 15.99 - chartIndex * 0.01, chartIndex === 0 ? 'b' : 'a')
      )),
      score('rare-outside-candidate', 2, 15.999, 'phi'),
      score('enough-0', 2, 16, 'a'),
      score('enough-1', 2, 16, 'a'),
      score('enough-2', 2, 16, 'a'),
      ...Array.from({ length: 6 }, (_, chartIndex) => (
        score(`enough-candidate-${chartIndex}`, 2, 15.9 - chartIndex * 0.01, 'a')
      )),
    ], index, primaryTags, catalog(catalogCharts));

    expect(analysis.pool).toMatchObject({
      threshold: 16,
      baseCount: 4,
      supplementedCount: 5,
      totalCount: 9,
    });
    expect(analysis.mainTags[0]).toMatchObject({
      sampleCount: 6,
      eligibleChartCount: 9,
      supplementedSampleCount: 5,
      isSmallSample: false,
    });
    expect(analysis.mainTags[0]!.rawAverageRks).toBeCloseTo(
      (16 + 15.99 + 15.98 + 15.97 + 15.96 + 15.95) / 6,
      10,
    );
    expect(analysis.mainTags[0]!.countCoefficient).toBeCloseTo(1.002, 10);
    expect(analysis.mainTags[0]!.charts.filter((chart) => chart.isSupplemental)).toHaveLength(5);
    expect(analysis.mainTags[0]!.charts.map((chart) => chart.songId)).not.toContain('rare-outside-candidate');
    expect(analysis.mainTags[2]).toMatchObject({
      sampleCount: 3,
      eligibleChartCount: 9,
      supplementedSampleCount: 0,
    });
  });

  it('normalizes equal-count full scores by eligible average difficulty', () => {
    const index: PhigrosKyouChartTagIndex = new Map([
      [chartVersionKey('lower-1', 'SD', 2), [resolved(primaryTags[0]!, 20)]],
      [chartVersionKey('lower-2', 'SD', 2), [resolved(primaryTags[0]!, 20)]],
      [chartVersionKey('higher-1', 'SD', 2), [resolved(primaryTags[1]!, 20)]],
      [chartVersionKey('higher-2', 'SD', 2), [resolved(primaryTags[1]!, 20)]],
    ]);
    const analysis = analyzePhigrosStrength(17, [
      score('lower-1', 2, 16.2, 'phi'),
      score('lower-2', 2, 16.4, 'phi'),
      score('higher-1', 2, 16.8, 'phi'),
      score('higher-2', 2, 17, 'phi'),
    ], index, primaryTags, catalog([
      ['lower-1', 2, 16.2],
      ['lower-2', 2, 16.4],
      ['higher-1', 2, 16.8],
      ['higher-2', 2, 17],
    ]));

    expect(analysis.mainTags[0]).toMatchObject({
      countCoefficient: 1,
      eligibleChartCount: 2,
    });
    expect(analysis.mainTags[0]!.rawAverageRks).toBeCloseTo(16.3, 8);
    expect(analysis.mainTags[0]!.eligibleAverageDifficulty).toBeCloseTo(16.3, 8);
    expect(analysis.mainTags[0]!.difficultyCoefficient).toBeCloseTo(16.9 / 16.3, 8);
    expect(analysis.mainTags[1]).toMatchObject({
      countCoefficient: 1,
      difficultyCoefficient: 1,
      eligibleChartCount: 2,
    });
    expect(analysis.mainTags[1]!.rawAverageRks).toBeCloseTo(16.9, 8);
    expect(analysis.mainTags[1]!.eligibleAverageDifficulty).toBeCloseTo(16.9, 8);
    expect(analysis.mainTags[0]!.averageRks).toBeCloseTo(16.9, 8);
    expect(analysis.mainTags[1]!.averageRks).toBeCloseTo(16.9, 8);
  });

  it('applies difficulty calibration gradually by sample coverage', () => {
    const index = new Map<string, PhigrosKyouResolvedTag[]>();
    const catalogCharts: [songId: string, levelIndex: number, constant: number][] = [];
    for (let chartIndex = 0; chartIndex < 4; chartIndex += 1) {
      const lowerSongId = `coverage-lower-${chartIndex}`;
      const higherSongId = `coverage-higher-${chartIndex}`;
      index.set(chartVersionKey(lowerSongId, 'SD', 2), [resolved(primaryTags[0]!, 20)]);
      index.set(chartVersionKey(higherSongId, 'SD', 2), [resolved(primaryTags[1]!, 20)]);
      catalogCharts.push([lowerSongId, 2, 16], [higherSongId, 2, 17]);
    }
    const analysis = analyzePhigrosStrength(16.1, [
      score('coverage-lower-0', 2, 15.9, 'a'),
      score('coverage-higher-0', 2, 15.9, 'a'),
    ], index, primaryTags, catalog(catalogCharts));

    expect(analysis.mainTags[0]).toMatchObject({
      sampleCount: 1,
      eligibleChartCount: 4,
      sampleCoverage: 0.25,
    });
    expect(analysis.mainTags[0]!.difficultyCoefficient).toBeCloseTo(1.015625, 8);
    expect(analysis.mainTags[0]!.averageRks).toBeCloseTo(15.9 * 1.015625, 8);
    expect(analysis.mainTags[1]).toMatchObject({
      difficultyCoefficient: 1,
      sampleCoverage: 0.25,
    });
  });

  it('keeps all five full-score axes equal despite different counts and difficulties', () => {
    const index = new Map<string, PhigrosKyouResolvedTag[]>();
    const records: ScoreRecord[] = [];
    const catalogCharts: [songId: string, levelIndex: number, constant: number][] = [];

    primaryTags.forEach((tag, tagIndex) => {
      const difficultyConstant = 16 + tagIndex * 0.1;
      for (let chartIndex = 0; chartIndex <= tagIndex; chartIndex += 1) {
        const songId = `full-${tag.id}-${chartIndex}`;
        index.set(chartVersionKey(songId, 'SD', 2), [resolved(tag, 20)]);
        records.push(score(songId, 2, difficultyConstant, 'phi'));
        catalogCharts.push([songId, 2, difficultyConstant]);
      }
    });

    const analysis = analyzePhigrosStrength(
      17,
      records,
      index,
      primaryTags,
      catalog(catalogCharts),
    );

    expect(analysis.mainTags.map((tag) => tag.eligibleChartCount)).toEqual([1, 2, 3, 4, 5]);
    analysis.mainTags.forEach((tag) => expect(tag.averageRks).toBeCloseTo(16.4, 8));
    analysis.mainTags.forEach((tag) => expect(tag.sampleCoverage).toBe(1));
    expect(analysis.areMainTagsTied).toBe(true);
    expect(analysis.strongestMainTag).toBeNull();
    expect(analysis.weakestMainTag).toBeNull();
    expect(analysis.recommendations).toEqual([]);
    expect(analysis.radarDomain.max).toBeCloseTo(16.5, 8);
  });

  it('recommends the three lowest-constant charts that can measurably improve the weakest tag', () => {
    const index = new Map<string, PhigrosKyouResolvedTag[]>();
    const catalogCharts: [songId: string, levelIndex: number, constant: number][] = [
      ['already-maxed', 2, 15.9],
      ['lowest', 2, 16],
      ['second', 2, 16.1],
      ['third', 2, 16.2],
      ['fourth', 2, 16.3],
    ];
    catalogCharts.forEach(([songId, levelIndex]) => {
      index.set(chartVersionKey(songId, 'SD', levelIndex), [resolved(primaryTags[0]!, 20)]);
    });
    const maxedRecord = {
      ...score('already-maxed', 2, 15.9, 'phi'),
      difficultyConstant: 15.9,
      achievements: 100,
    };

    const analysis = analyzePhigrosStrength(
      16.1,
      [maxedRecord],
      index,
      primaryTags,
      catalog(catalogCharts),
    );

    expect(analysis.weakestMainTag?.name).toBe('读谱');
    expect(analysis.recommendations.map((item) => item.songId)).toEqual([
      'lowest',
      'second',
      'third',
    ]);
    analysis.recommendations.forEach((item) => {
      expect(item.targetAcc * 100).toBe(Math.round(item.targetAcc * 100));
      expect(item.targetAcc).toBeLessThanOrEqual(100);
      expect(item.targetRks).toBeCloseTo(calculateRks(item.difficultyConstant, item.targetAcc), 10);
      expect(item.projectedGain).toBeGreaterThanOrEqual(0.0001 - 1e-9);
      expect(item.currentAcc).toBeNull();
    });
  });

  it('keeps an honest radar interval for empty and degenerate pools', () => {
    const empty = analyzePhigrosStrength(0, [], new Map(), primaryTags, catalog([]));
    expect(empty.pool.totalCount).toBe(0);
    expect(empty.radarDomain).toEqual({ min: 0, max: 0.1 });

    const flat = analyzePhigrosStrength(16.2, [score('flat', 2, 16, 'a')], new Map(), primaryTags, catalog([
      ['flat', 2, 16],
    ]));
    expect(flat.radarDomain).toEqual({ min: 16, max: 16.1 });
  });

  it('reports a non-five-axis upstream catalog instead of fabricating axes', () => {
    const analysis = analyzePhigrosStrength(16, [], new Map(), primaryTags.slice(0, 4), catalog([]));
    expect(analysis.hasExpectedPrimaryAxes).toBe(false);
  });
});
