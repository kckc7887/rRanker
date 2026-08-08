import {
  isChunithmCollectionComputable,
  isChunithmCollectionKind,
  summarizeChunithmCollectionProgress,
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
        { id: 100, title: '曲A', completed: true },
        { id: 200, title: '曲B', completed: false },
      ],
      completed: false,
    },
    {
      difficulties: [3],
      fullCombo: 'alljustice',
      songs: [
        { id: 300, title: '曲C', completed: true },
      ],
      completed: true,
    },
  ],
};

describe('chunithm collections domain', () => {
  it('summarizes group and song completion', () => {
    const summary = summarizeChunithmCollectionProgress(collectionWithConditions.required);
    expect(summary).toEqual({
      groups: 2,
      completedGroups: 1,
      songRequirements: 3,
      completedSongs: 2,
    });
  });

  it('returns empty summary without required conditions', () => {
    expect(summarizeChunithmCollectionProgress(undefined)).toEqual({
      groups: 0,
      completedGroups: 0,
      songRequirements: 0,
      completedSongs: 0,
    });
    expect(summarizeChunithmCollectionProgress([])).toEqual({
      groups: 0,
      completedGroups: 0,
      songRequirements: 0,
      completedSongs: 0,
    });
  });

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
});
