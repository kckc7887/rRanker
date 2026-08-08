import type { ChunithmScore } from '@/domain/chunithm-personal';
import {
  calculateChunithmCollectionProgress,
  chunithmScoreMeetsRequirement,
  isChunithmCollectionComputable,
  isChunithmCollectionKind,
  type ChunithmCollection,
} from '@/domain/chunithm-collections';

const collectionWithConditions: ChunithmCollection = {
  id: 1,
  name: '测试称号',
  required: [
    {
      difficulties: [0, 1, 2, 3],
      rank: 's',
      songs: [
        { id: 100, title: '曲A' },
        { id: 200, title: '曲B' },
      ],
    },
    {
      difficulties: [3],
      fullCombo: 'alljustice',
      songs: [
        { id: 300, title: '曲C' },
      ],
    },
  ],
};

function score(partial: Partial<ChunithmScore> & { id: number; level_index: number }): ChunithmScore {
  return {
    song_name: '',
    level: '',
    score: 1_000_000,
    clear: 'clear',
    full_combo: null,
    full_chain: null,
    ...partial,
  } as ChunithmScore;
}

describe('chunithm collections domain', () => {
  it('marks collections with song requirements as computable', () => {
    expect(isChunithmCollectionComputable(collectionWithConditions)).toBe(true);
    expect(isChunithmCollectionComputable({ id: 2, name: '无条件' })).toBe(false);
    expect(isChunithmCollectionComputable({
      id: 3,
      name: '空曲目',
      required: [{ difficulties: [0], songs: [] }],
    })).toBe(false);
  });

  it('classifies collection kinds', () => {
    expect(isChunithmCollectionKind('trophy')).toBe(true);
    expect(isChunithmCollectionKind('character')).toBe(true);
    expect(isChunithmCollectionKind('plate')).toBe(true);
    expect(isChunithmCollectionKind('icon')).toBe(true);
    expect(isChunithmCollectionKind('frame')).toBe(false);
    expect(isChunithmCollectionKind(undefined)).toBe(false);
  });

  it('checks score requirements with rank and combo thresholds', () => {
    const requirement = collectionWithConditions.required![0]!;
    expect(chunithmScoreMeetsRequirement(score({ id: 100, level_index: 0, rank: 's' }), requirement)).toBe(true);
    expect(chunithmScoreMeetsRequirement(score({ id: 100, level_index: 0, rank: 'ss' }), requirement)).toBe(true);
    expect(chunithmScoreMeetsRequirement(score({ id: 100, level_index: 0, rank: 'aaa' }), requirement)).toBe(false);
    // 无 rank 字段时按分数推断：90 万分 → A，低于 S
    expect(chunithmScoreMeetsRequirement(
      score({ id: 100, level_index: 0, score: 900_000 }),
      requirement,
    )).toBe(false);
  });

  it('computes progress from the local score snapshot', () => {
    const progress = calculateChunithmCollectionProgress(collectionWithConditions, [
      score({ id: 100, level_index: 0, rank: 's' }),
      score({ id: 100, level_index: 1, rank: 'ss' }),
      score({ id: 100, level_index: 2, rank: 's' }),
      score({ id: 100, level_index: 3, rank: 'sss' }),
      score({ id: 300, level_index: 3, full_combo: 'alljustice' }),
    ]);

    // 组1：曲A×4难度 + 曲B×4难度；组2：曲C×1难度 → 共 9 项
    expect(progress.total).toBe(9);
    expect(progress.completed).toBe(5);
    expect(progress.completedSongIds).toEqual(['100', '300']);
    expect(progress.missingSongIds).toEqual(['200']);
    expect(progress.missingSongs[0]?.missingDifficulties).toEqual([0, 1, 2, 3]);
  });

  it('reports missing difficulties when scores do not meet the thresholds', () => {
    const progress = calculateChunithmCollectionProgress(collectionWithConditions, [
      score({ id: 100, level_index: 0, rank: 's' }),
      score({ id: 100, level_index: 1, rank: 's' }),
      score({ id: 100, level_index: 2, rank: 's' }),
      score({ id: 100, level_index: 3, rank: 's' }),
      score({ id: 200, level_index: 0, rank: 's' }),
      score({ id: 200, level_index: 1, rank: 's' }),
      score({ id: 200, level_index: 2, rank: 'aaa' }), // 低于 S
      score({ id: 200, level_index: 3, rank: 's' }),
      score({ id: 300, level_index: 3, full_combo: 'alljustice' }),
    ]);

    expect(progress.missingSongIds).toEqual(['200']);
    expect(progress.missingSongs[0]?.missingDifficulties).toEqual([2]);
  });

  it('treats empty difficulties as any difficulty', () => {
    const anyDifficulty: ChunithmCollection = {
      id: 4,
      name: '任意难度',
      required: [{ difficulties: [], rank: 'sss', songs: [{ id: 500, title: '曲E' }] }],
    };
    const progress = calculateChunithmCollectionProgress(anyDifficulty, [
      score({ id: 500, level_index: 3, rank: 'sss' }),
    ]);
    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.missingSongIds).toEqual([]);
  });

  it('returns an empty progress without requirements', () => {
    const progress = calculateChunithmCollectionProgress({ id: 9, name: '无要求' }, []);
    expect(progress.total).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.missingSongs).toEqual([]);
  });

  it('ranks by score when the upstream score has no rank field', () => {
    // 无 rank 字段时按分数推断评级：1009000 → SSS+
    const requirement = { difficulties: [3], rank: 'sss' as const, songs: [{ id: 600, title: '曲F' }] };
    const progress = calculateChunithmCollectionProgress(
      { id: 6, name: '按分评级', required: [requirement] },
      [score({ id: 600, level_index: 3, score: 1_009_000 })],
    );
    expect(progress.completed).toBe(1);
  });
});
