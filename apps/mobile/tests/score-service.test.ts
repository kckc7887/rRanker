import { DatabaseSync } from 'node:sqlite';
import { fixtureCatalog, fixturePlayer, fixtureRecords } from '@/fixtures/sanitized';
import { FixtureCatalogProvider, FixtureProvider } from './fixture-provider';
let ProviderError: typeof import('@/providers/errors')['ProviderError'];
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
  ({ ProviderError } = await import('@/providers/errors'));
  ({ ScoreService, buildScoreSnapshot } = await import('@/services/score-service'));
  const { SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository');
  repository = new SqliteSnapshotRepository();
});
afterEach(() => database.close());

describe('ScoreService', () => {
  it('stores a valid snapshot after refresh', async () => {
    const snapshot = await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), 'acct-a',
    ).load();
    expect(snapshot.records).toHaveLength(54); expect((await repository.getLatest('acct-a'))?.best50.b35).toHaveLength(35);
  });
  it('removes unsupported utage ids before building score and filter data', () => {
    const utage = {
      ...fixtureRecords[0]!, songId: '100123', title: '宴会场', levelIndex: 0,
      difficulty: 'basic' as const, type: 'DX' as const,
    };
    const snapshot = buildScoreSnapshot(fixturePlayer, [fixtureRecords[0]!, utage], fixtureCatalog);
    expect(snapshot.records.map((record) => record.songId)).toEqual([fixtureRecords[0]!.songId]);
  });
  it('keeps mapped UTAGE records out of B35/B15 and total rating', () => {
    const utage = {
      ...fixtureRecords[0]!,
      songId: '100123',
      title: 'U·TA·GE',
      levelIndex: 0,
      difficulty: 'utage' as const,
      type: 'UTAGE' as const,
      rating: 0,
    };
    const snapshot = buildScoreSnapshot(fixturePlayer, [fixtureRecords[0]!, utage], fixtureCatalog);
    expect(snapshot.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ songId: '100123', type: 'UTAGE', difficulty: 'utage' }),
    ]));
    expect([...snapshot.best50.b35, ...snapshot.best50.b15]
      .some((record) => record.type === 'UTAGE')).toBe(false);
    expect(snapshot.best50.rating).toBe(fixtureRecords[0]!.rating);
  });
  it('returns stale cache without overwriting it when upstream fails', async () => {
    await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), 'acct-a',
    ).load();
    const saved = await repository.getLatest('acct-a');
    const fail = async (): Promise<never> => { throw new Error('network'); };
    const failingProvider = { getPlayer: fail, getRecords: fail };
    const cached = await new ScoreService(
      failingProvider, new FixtureCatalogProvider(), 'acct-a',
    ).load();
    expect(cached.source.kind).toBe(saved?.source.kind); expect(cached.source.isStale).toBe(true);
    expect(await repository.getLatest('acct-a')).toEqual(saved);
  });



  it('isolates score cache by account id', async () => {
    await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), 'acct-a',
    ).load();
    const fail = async (): Promise<never> => { throw new Error('network'); };
    await expect(new ScoreService(
      { getPlayer: fail, getRecords: fail },
      new FixtureCatalogProvider(),
      'acct-b',
    ).load()).rejects.toThrow('network');
  });


  it('deduplicates concurrent loads for the same account', async () => {
    const score = new FixtureProvider();
    const catalog = new FixtureCatalogProvider();
    const getPlayer = vi.spyOn(score, 'getPlayer');
    const getRecords = vi.spyOn(score, 'getRecords');
    const getCatalog = vi.spyOn(catalog, 'getCatalog');
    const service = new ScoreService(score, catalog, 'acct-dedupe');
    const [a, b] = await Promise.all([service.load(), service.load()]);
    expect(a).toEqual(b);
    expect(getPlayer).toHaveBeenCalledTimes(1);
    expect(getRecords).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent loads across service instances', async () => {
    const score = new FixtureProvider();
    const catalog = new FixtureCatalogProvider();
    const getPlayer = vi.spyOn(score, 'getPlayer');
    const serviceA = new ScoreService(score, catalog, 'acct-dedupe-shared');
    const serviceB = new ScoreService(score, catalog, 'acct-dedupe-shared');
    const [a, b] = await Promise.all([serviceA.load(), serviceB.load()]);
    expect(a).toEqual(b);
    expect(getPlayer).toHaveBeenCalledTimes(1);
  });

  it('combines provider actual DXScore with theoretical score notes from the detailed API', async () => {
    const record = { ...fixtureRecords[0]!, dxScore: 1836 };
    const catalog = structuredClone(fixtureCatalog);
    catalog.songs = [{
      id: record.songId, title: record.title, version: record.version,
      charts: [{
        songId: record.songId, type: record.type, levelIndex: record.levelIndex,
        level: record.level, difficulty: record.difficulty,
        difficultyConstant: record.difficultyConstant,
        notes: { tap: 300, hold: 80, slide: 200, touch: 20, break: 90, total: 690 },
      }],
    }];
    const scoreProvider = {
      getPlayer: async () => structuredClone(fixturePlayer),
      getRecords: async () => [structuredClone(record)],
    };
    const catalogProvider = {
      ...new FixtureCatalogProvider(),
      getCatalog: async () => structuredClone(catalog),
      getDetailedCatalog: async () => { throw new Error('详细曲库不应被调用'); },
      getSong: async () => structuredClone(catalog.songs[0]!),
      getAliases: async () => ({ aliases: [], source: catalog.source }),
      getPlates: async () => ({ plates: [], source: catalog.source }),
      getCollections: async () => ({ items: [], source: catalog.source }),
    };

    const snapshot = await new ScoreService(scoreProvider, catalogProvider, 'acct-dx-score').load();
    expect(snapshot.records[0]).toMatchObject({ dxScore: 1836, notes: { total: 690 } });
  });
});

it.each(['authentication', 'permission'] as const)('已有缓存时保留%s失败供公共刷新要求重新登录', async code => {
  await new ScoreService(new FixtureProvider(), new FixtureCatalogProvider(), 'acct-auth').load();
  const saved = await repository.getLatest('acct-auth');
  const failure = new ProviderError(code, 'session expired', false);
  const fail = async (): Promise<never> => { throw failure; };
  await expect(new ScoreService({ getPlayer: fail, getRecords: fail }, new FixtureCatalogProvider(), 'acct-auth').load()).rejects.toBe(failure);
  expect(await repository.getLatest('acct-auth')).toEqual(saved);
});

it('取消一个成绩消费者仍允许另一个完成同账号共享读取', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = new AbortController(), second = new AbortController();
  const provider = {
    getPlayer: vi.fn(async () => { await gate; return structuredClone(fixturePlayer); }),
    getRecords: vi.fn(async () => { await gate; return structuredClone(fixtureRecords); }),
  };
  const service = new ScoreService(provider, new FixtureCatalogProvider(), 'acct-cancel-consumer');
  const a = service.load(first.signal), b = service.load(second.signal);
  first.abort(new Error('first left'));
  await expect(a).rejects.toThrow('first left');
  release();
  const value = await b;
  expect(value.source.isStale).toBe(false);
  expect(provider.getPlayer).toHaveBeenCalledTimes(1);
  expect((await repository.getLatest('acct-cancel-consumer'))?.player).toEqual(value.player);
});
