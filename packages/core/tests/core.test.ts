import { describe, expect, it, vi } from 'vitest';
import {
  LxnsCatalogProvider,
  MaxedMaimaiTestProvider,
  ProviderError,
  ScoreService,
  buildMaxedMaimaiRecords,
  buildScoreSnapshot,
  chartVersionKey,
  fetchJson,
  type CatalogRepository,
  type CatalogSnapshot,
  type ScoreSnapshot,
  type SnapshotRepository,
} from '../src';

const source = {
  kind: 'lxns' as const,
  label: '测试曲库',
  updatedAt: '2026-07-27T00:00:00.000Z',
  isStale: false,
};

const catalog: CatalogSnapshot = {
  currentVersion: { id: 2, title: '当前版本' },
  versions: [
    { id: 1, title: '旧版本' },
    { id: 2, title: '当前版本' },
  ],
  songs: [
    {
      id: '1',
      title: '旧曲',
      version: '旧版本',
      versionId: 1,
      charts: [
        {
          songId: '1',
          type: 'SD',
          levelIndex: 3,
          level: '14',
          difficulty: 'master',
          difficultyConstant: 14,
          versionId: 1,
          notes: { tap: 10, hold: 2, slide: 3, touch: 4, break: 1, total: 20 },
        },
      ],
    },
    {
      id: '2',
      title: '新曲',
      version: '当前版本',
      versionId: 2,
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
    {
      id: '3',
      title: '禁用曲',
      version: '当前版本',
      versionId: 2,
      disabled: true,
      charts: [
        {
          songId: '3',
          type: 'DX',
          levelIndex: 0,
          level: '1',
          difficulty: 'basic',
          difficultyConstant: 1,
          versionId: 2,
        },
      ],
    },
    {
      id: '100123',
      title: '宴会场',
      version: '当前版本',
      versionId: 2,
      charts: [
        {
          songId: '100123',
          type: 'DX',
          levelIndex: 0,
          level: '宴',
          difficulty: 'unknown',
          difficultyConstant: 0,
          versionId: 2,
        },
      ],
    },
  ],
  chartVersionIndex: {
    [chartVersionKey('1', 'SD', 3)]: 1,
    [chartVersionKey('2', 'DX', 4)]: 2,
    [chartVersionKey('3', 'DX', 0)]: 2,
    [chartVersionKey('100123', 'DX', 0)]: 2,
  },
  source,
};

class MemoryRepository implements SnapshotRepository, CatalogRepository {
  snapshot: ScoreSnapshot | null = null;
  catalog: CatalogSnapshot | null = null;
  async initialize() {}
  async getLatest() {
    return this.snapshot;
  }
  async save(_accountId: string, snapshot: ScoreSnapshot) {
    this.snapshot = structuredClone(snapshot);
  }
  async clear() {
    this.snapshot = null;
  }
  async getLatestCatalog() {
    return this.catalog;
  }
  async saveCatalog(value: CatalogSnapshot) {
    this.catalog = structuredClone(value);
  }
}

describe('舞萌共享核心', () => {
  it('生成全满成绩并排除禁用曲，DX Score 按物量计算', () => {
    const records = buildMaxedMaimaiRecords(catalog);
    expect(records.map((record) => record.title)).toEqual([
      '旧曲',
      '新曲',
      '宴会场',
    ]);
    expect(records[0]).toMatchObject({
      achievements: 101,
      dxScore: 60,
      fc: 'app',
      fs: 'fsdp',
      rate: 'sssp',
    });
  });

  it('构建快照时排除宴会场并按 B35/B15 动态计算 Rating', async () => {
    const provider = new MaxedMaimaiTestProvider();
    const player = await provider.getPlayer();
    const snapshot = buildScoreSnapshot(
      player,
      await provider.getRecordsFromCatalog(catalog),
      catalog,
    );
    expect(snapshot.records.map((record) => record.title)).toEqual(['旧曲', '新曲']);
    expect(snapshot.best50.b35).toHaveLength(1);
    expect(snapshot.best50.b15).toHaveLength(1);
    expect(snapshot.player.rating).toBe(snapshot.best50.rating);
    expect(snapshot.best50.rating).toBeGreaterThan(0);
  });

  it('网络失败时从仓储回退到最近有效快照', async () => {
    const repository = new MemoryRepository();
    repository.catalog = structuredClone(catalog);
    const provider = new MaxedMaimaiTestProvider();
    const cached = buildScoreSnapshot(
      await provider.getPlayer(),
      await provider.getRecordsFromCatalog(catalog),
      catalog,
    );
    repository.snapshot = cached;
    const fail = vi.fn(async () => {
      throw new ProviderError('network', 'offline', true);
    });
    const catalogProvider = new LxnsCatalogProvider(fail);
    const result = await new ScoreService(
      provider,
      catalogProvider,
      'maimai:test',
      repository,
      repository,
    ).load();
    expect(result.records).toHaveLength(2);
    expect(result.catalogSource).toMatchObject({ kind: 'cache', isStale: true });
  });

  it('HTTP 429 映射为不自动隐藏的限流错误', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{}', { status: 429, statusText: 'Too Many Requests' }),
    );
    await expect(fetchJson(fetchImpl, 'https://example.invalid')).rejects.toMatchObject({
      code: 'rate_limit',
      retryable: true,
    });
  });

  it('LXNS 响应经 Zod 校验后映射成统一曲库', async () => {
    const response = {
      versions: [
        { id: 1, title: '旧版本', version: 1 },
        { id: 2, title: '当前版本', version: 2 },
      ],
      songs: [
        {
          id: 10,
          title: '契约曲',
          artist: '曲师',
          version: 2,
          difficulties: {
            standard: [],
            dx: [
              {
                type: 'dx',
                difficulty: 3,
                level: '13+',
                level_value: 13.7,
                version: 2,
                note_designer: '谱师',
                notes: {
                  total: 100,
                  tap: 50,
                  hold: 10,
                  slide: 20,
                  touch: 10,
                  break: 10,
                },
              },
            ],
          },
        },
      ],
    };
    const fetchImpl = vi.fn(async () => Response.json(response));
    const result = await new LxnsCatalogProvider(fetchImpl).getDetailedCatalog();
    expect(result.currentVersion).toEqual({ id: 2, title: '当前版本' });
    expect(result.songs[0]?.charts[0]).toMatchObject({
      type: 'DX',
      difficulty: 'master',
      difficultyConstant: 13.7,
    });
  });
});
