import { chartVersionKey } from '@/domain/catalog';
import { LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import type { CatalogSnapshot } from '@/domain/models';
import { buildMaxedMaimaiRecords, MaxedMaimaiTestProvider } from '@/providers/maxed-maimai-test-provider';
import { isCatalogDrivenScoreProvider } from '@/providers/contracts';
import { DatabaseSync } from 'node:sqlite';
let LocalMaimaiScoreProvider: typeof import('@/providers/local-score-provider')['LocalMaimaiScoreProvider'];
let ScoreService: typeof import('@/services/score-service')['ScoreService'];
let buildScoreSnapshot: typeof import('@/services/score-service')['buildScoreSnapshot'];
let repository: InstanceType<typeof import('@/storage/sqlite-snapshot-repository')['SqliteSnapshotRepository']>;
let database: DatabaseSync;
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => database.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).get(...args) ?? null,
}) }));
beforeEach(async () => {
  database = new DatabaseSync(':memory:'); vi.resetModules();
  ({ LocalMaimaiScoreProvider } = await import('@/providers/local-score-provider'));
  ({ ScoreService, buildScoreSnapshot } = await import('@/services/score-service'));
  const { SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository');
  repository = new SqliteSnapshotRepository();
});
afterEach(() => database.close());

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

function catalogProvider(getDetailedCatalog: () => Promise<CatalogSnapshot>) {
  return {
    getCatalog: getDetailedCatalog,
    getDetailedCatalog,
    getSong: async (songId: string) => {
      const catalog = await getDetailedCatalog();
      const song = catalog.songs.find((item) => item.id === songId);
      if (!song) throw new Error(`Missing test song: ${songId}`);
      return song;
    },
    getAliases: async () => ({ aliases: [], source }),
    getPlates: async () => ({ plates: [], source }),
    getCollections: async () => ({ items: [], source }),
  };
}

describe('本地查分器', () => {
  it('首次为空，写入快照后可完全从本地读取', async () => {
    const provider = new LocalMaimaiScoreProvider();
    await expect(provider.getPlayer()).resolves.toMatchObject({
      id: LOCAL_MAIMAI_ACCOUNT_ID,
      displayName: '本地玩家',
      rating: 0,
      source: { kind: 'local' },
    });
    await expect(provider.getRecords()).resolves.toEqual([]);

    const records = buildMaxedMaimaiRecords(catalog);
    const stored = buildScoreSnapshot(await provider.getPlayer(), records, catalog);
    await repository.save(LOCAL_MAIMAI_ACCOUNT_ID, stored);
    await expect(provider.getRecords()).resolves.toHaveLength(2);
    await expect(provider.getPlayer()).resolves.toMatchObject({
      displayName: '本地玩家',
      rating: stored.best50.rating,
    });
  });

  it('多个本地玩家按账号 ID 隔离成绩，并分别使用自己的名称', async () => {
    const aliceId = 'maimai:local:alice';
    const bobId = 'maimai:local:bob';
    const alice = new LocalMaimaiScoreProvider(aliceId, 'Alice');
    const bob = new LocalMaimaiScoreProvider(bobId, 'Bob');
    const aliceSnapshot = buildScoreSnapshot(
      await alice.getPlayer(),
      buildMaxedMaimaiRecords(catalog).slice(0, 1),
      catalog,
    );
    await repository.save(aliceId, aliceSnapshot);

    await expect(alice.getRecords()).resolves.toHaveLength(1);
    await expect(bob.getRecords()).resolves.toEqual([]);
    await expect(alice.getPlayer()).resolves.toMatchObject({ id: aliceId, displayName: 'Alice' });
    await expect(bob.getPlayer()).resolves.toMatchObject({ id: bobId, displayName: 'Bob', rating: 0 });
  });

  it('曲库离线时回退到已有的本地快照', async () => {
    const provider = new LocalMaimaiScoreProvider();
    await repository.save(LOCAL_MAIMAI_ACCOUNT_ID, buildScoreSnapshot(
      await provider.getPlayer(),
      buildMaxedMaimaiRecords(catalog),
      catalog,
    ));
    const fail = async (): Promise<CatalogSnapshot> => { throw new Error('offline'); };
    const snapshot = await new ScoreService(
      provider,
      catalogProvider(fail),
      LOCAL_MAIMAI_ACCOUNT_ID,
    ).load();
    expect(snapshot.source).toMatchObject({ kind: 'local', isStale: true });
    expect(snapshot.records).toHaveLength(2);
  });
});

describe('舞萌示例查分器', () => {
  it('使用最高段位里皆传', async () => {
    await expect(new MaxedMaimaiTestProvider().getPlayer()).resolves.toMatchObject({
      extension: { kind: 'maimai', courseRank: 23 },
    });
  });

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

  it('实现 CatalogDrivenScoreProvider，统一成绩覆盖全部启用谱面', async () => {
    const provider = new MaxedMaimaiTestProvider();
    expect(isCatalogDrivenScoreProvider(provider)).toBe(true);
    const records = await provider.getRecordsFromCatalog(catalog);
    const enabledKeys = catalog.songs
      .filter((song) => !song.disabled)
      .flatMap((song) => song.charts.map((chart) => `${chart.songId}:${chart.type}:${chart.levelIndex}`));
    expect(records.map((record) => `${record.songId}:${record.type}:${record.levelIndex}`)).toEqual(enabledKeys);
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
    expect(snapshot.records.every((record) => record.notes === undefined)).toBe(true);
    expect(snapshot.player.rating).toBe(snapshot.best50.rating);
    expect(snapshot.player.rating).toBeGreaterThan(0);
  });

  it('详细曲库请求失败时不使用轻量曲库猜测测试成绩', async () => {
    const fail = async (): Promise<CatalogSnapshot> => { throw new Error('offline'); };
    await expect(new ScoreService(
      new MaxedMaimaiTestProvider(),
      catalogProvider(fail),
      'maimai:test',
    ).load()).rejects.toThrow('offline');
  });
});
