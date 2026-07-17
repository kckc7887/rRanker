import { chartVersionKey } from '@/domain/catalog';
import { LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import { LocalMaimaiScoreProvider } from '@/providers/local-score-provider';
import { buildMaxedMaimaiRecords, MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { buildScoreSnapshot, ScoreService } from '@/services/score-service';

const source = {
  kind: 'lxns' as const,
  label: '测试曲库',
  updatedAt: '2026-07-17T00:00:00.000Z',
  isStale: false,
};

const catalog: CatalogSnapshot = {
  currentVersion: { id: 2, title: '当前版本' },
  versions: [{ id: 1, title: '旧版本' }, { id: 2, title: '当前版本' }],
  songs: [
    {
      id: '1',
      title: '已锁定歌曲',
      version: '当前版本',
      versionId: 2,
      locked: true,
      charts: [
        {
          songId: '1', type: 'SD', levelIndex: 3, level: '14', difficulty: 'master',
          difficultyConstant: 14, versionId: 2,
          notes: { tap: 10, hold: 2, slide: 3, touch: 4, break: 1, total: 20 },
        },
        {
          songId: '1', type: 'DX', levelIndex: 4, level: '14+', difficulty: 'remaster',
          difficultyConstant: 14.8, versionId: 2,
        },
      ],
    },
    {
      id: '2', title: '已禁用歌曲', version: '旧版本', versionId: 1, disabled: true,
      charts: [{
        songId: '2', type: 'SD', levelIndex: 0, level: '1', difficulty: 'basic',
        difficultyConstant: 1, versionId: 1,
      }],
    },
  ],
  chartVersionIndex: {
    [chartVersionKey('1', 'SD', 3)]: 2,
    [chartVersionKey('1', 'DX', 4)]: 2,
    [chartVersionKey('2', 'SD', 0)]: 1,
  },
  source,
};

class MemorySnapshotRepository implements SnapshotRepository {
  snapshot: ScoreSnapshot | null = null;
  async initialize() {}
  async getLatest(accountId: string) {
    return accountId === LOCAL_MAIMAI_ACCOUNT_ID ? this.snapshot : null;
  }
  async save(_accountId: string, snapshot: ScoreSnapshot) {
    this.snapshot = structuredClone(snapshot);
  }
  async clear() { this.snapshot = null; }
}

function catalogProvider(getDetailedCatalog: () => Promise<CatalogSnapshot>) {
  return {
    getCatalog: getDetailedCatalog,
    getDetailedCatalog,
    getAliases: async () => ({ aliases: [], source }),
    getPlates: async () => ({ plates: [], source }),
    getCollections: async () => ({ items: [], source }),
  };
}

describe('本地查分器', () => {
  it('首次为空，写入快照后可完全从本地读取', async () => {
    const repository = new MemorySnapshotRepository();
    const provider = new LocalMaimaiScoreProvider(repository);
    await expect(provider.getPlayer()).resolves.toMatchObject({
      id: LOCAL_MAIMAI_ACCOUNT_ID,
      displayName: '本地玩家',
      rating: 0,
      source: { kind: 'local' },
    });
    await expect(provider.getRecords()).resolves.toEqual([]);

    const records = buildMaxedMaimaiRecords(catalog);
    repository.snapshot = buildScoreSnapshot(await provider.getPlayer(), records, catalog);
    await expect(provider.getRecords()).resolves.toHaveLength(2);
    await expect(provider.getPlayer()).resolves.toMatchObject({
      displayName: '本地玩家',
      rating: repository.snapshot.best50.rating,
    });
  });

  it('曲库离线时回退到已有的本地快照', async () => {
    const repository = new MemorySnapshotRepository();
    const provider = new LocalMaimaiScoreProvider(repository);
    repository.snapshot = buildScoreSnapshot(
      await provider.getPlayer(),
      buildMaxedMaimaiRecords(catalog),
      catalog,
    );
    const fail = async (): Promise<CatalogSnapshot> => { throw new Error('offline'); };
    const snapshot = await new ScoreService(
      provider,
      catalogProvider(fail),
      LOCAL_MAIMAI_ACCOUNT_ID,
      repository,
    ).load();
    expect(snapshot.source).toMatchObject({ kind: 'cache', isStale: true });
    expect(snapshot.records).toHaveLength(2);
  });
});

describe('舞萌测试查分器', () => {
  it('覆盖所有未禁用谱面并生成 AP+、FDX+ 与满 DXScore', () => {
    const records = buildMaxedMaimaiRecords(catalog);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.achievements === 101)).toBe(true);
    expect(records.every((record) => record.rate === 'sssp')).toBe(true);
    expect(records.every((record) => record.fc === 'app')).toBe(true);
    expect(records.every((record) => record.fs === 'fsdp')).toBe(true);
    expect(records.find((record) => record.type === 'SD')?.dxScore).toBe(60);
    expect(records.find((record) => record.type === 'DX')?.dxScore).toBeNull();
  });

  it('只取一次详细曲库并从 B50 动态计算 Rating', async () => {
    const provider = new MaxedMaimaiTestProvider();
    const getDetailedCatalog = vi.fn(async () => structuredClone(catalog));
    const snapshot = await new ScoreService(
      provider,
      catalogProvider(getDetailedCatalog),
      'maimai:test',
    ).load();
    expect(getDetailedCatalog).toHaveBeenCalledTimes(1);
    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.player.rating).toBe(snapshot.best50.rating);
    expect(snapshot.player.rating).toBeGreaterThan(0);
  });
});
