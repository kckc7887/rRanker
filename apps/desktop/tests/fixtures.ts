import {
  buildScoreSnapshot,
  chartVersionKey,
  MaxedMaimaiTestProvider,
  type CatalogSnapshot,
  type ScoreSnapshot,
} from '@rranker/core';

const source = {
  kind: 'lxns' as const,
  label: '测试曲库',
  updatedAt: '2026-07-27T08:00:00.000Z',
  isStale: false,
};

export const desktopCatalog: CatalogSnapshot = {
  currentVersion: { id: 2, title: '当前版本' },
  versions: [
    { id: 1, title: '旧版本' },
    { id: 2, title: '当前版本' },
  ],
  songs: [
    {
      id: '1',
      title: 'Alpha Song',
      version: '旧版本',
      charts: [
        {
          songId: '1',
          type: 'SD',
          levelIndex: 3,
          level: '13',
          difficulty: 'master',
          difficultyConstant: 13,
          versionId: 1,
        },
      ],
    },
    {
      id: '2',
      title: 'Beta Song',
      version: '当前版本',
      charts: [
        {
          songId: '2',
          type: 'DX',
          levelIndex: 4,
          level: '14+',
          difficulty: 'remaster',
          difficultyConstant: 14.8,
          versionId: 2,
        },
      ],
    },
  ],
  chartVersionIndex: {
    [chartVersionKey('1', 'SD', 3)]: 1,
    [chartVersionKey('2', 'DX', 4)]: 2,
  },
  source,
};

export async function desktopSnapshot(): Promise<ScoreSnapshot> {
  const provider = new MaxedMaimaiTestProvider();
  return buildScoreSnapshot(
    await provider.getPlayer(),
    await provider.getRecordsFromCatalog(desktopCatalog),
    desktopCatalog,
  );
}
