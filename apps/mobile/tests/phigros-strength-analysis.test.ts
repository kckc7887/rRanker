import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import type {
  PhigrosKyouChartTagIndex,
  PhigrosKyouResolvedTag,
  PhigrosKyouTag,
} from '@/domain/phigros-kyou';
import {
  analyzePhigrosStrength,
  resolvePhigrosStrengthAvailabilityCoefficient,
  resolvePhigrosStrengthThreshold,
} from '@/domain/phigros-strength-analysis';
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
      tag.coefficient,
      tag.eligibleChartCount,
      tag.sampleCount,
    ])).toEqual([
      ['读谱', 16, 1, 2, 2],
      ['耐力', 16.1, 1.01, 1, 1],
      ['协调', null, 1.02, 0, 0],
      ['手速', null, 1.02, 0, 0],
      ['多指', null, 1.02, 0, 0],
    ]);
    expect(analysis.mainTags[0]!.averageRks).toBeCloseTo(16, 8);
    expect(analysis.mainTags[1]!.averageRks).toBeCloseTo(16.261, 8);
    expect(analysis.strongestMainTag?.name).toBe('耐力');
    expect(analysis.weakestMainTag?.name).toBe('读谱');
    expect(analysis.radarDomain.min).toBe(15.9);
    expect(analysis.radarDomain.max).toBeCloseTo(16.361, 8);
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
      eligibleChartCount: 1,
      sampleCount: 1,
      isSmallSample: true,
    });
  });

  it('counts unplayed and failed-grade charts as candidates and boosts rarer tags', () => {
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

    expect(analysis.pool.totalCount).toBe(2);
    expect(analysis.mainTags[0]).toMatchObject({
      rawAverageRks: 16,
      coefficient: 1.015,
      eligibleChartCount: 1,
      sampleCount: 1,
    });
    expect(analysis.mainTags[1]).toMatchObject({
      rawAverageRks: 16,
      averageRks: 16,
      coefficient: 1,
      eligibleChartCount: 4,
      sampleCount: 1,
    });
    expect(analysis.mainTags[0]!.averageRks).toBeCloseTo(16.24, 8);
    expect(analysis.secondaryTags[0]).toMatchObject({
      name: '差速',
      coefficient: 1,
      eligibleChartCount: 1,
      sampleCount: 1,
    });
    expect(analysis.strongestMainTag?.name).toBe('读谱');
    expect(analysis.weakestMainTag?.name).toBe('耐力');
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
