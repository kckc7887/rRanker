import { DatabaseSync } from 'node:sqlite';
import { SqliteSnapshotRepository, resetSnapshotSchemaForTests } from '@/storage/sqlite-snapshot-repository';
import { resetRrankerDatabaseForTests, runDatabaseWrite } from '@/storage/rranker-database';
import { captureResourceWrites, invalidateResourceWrites } from '@/services/snapshot-cache-utils';

import { SqliteUserLibraryRepository, resetUserLibrarySchemaForTests } from '@/storage/sqlite-user-library-repository';

const bridge = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: bridge.open }));

describe('SQLite storage with real SQL and a measured async bridge', () => {
  let database: DatabaseSync;
  let repository: SqliteSnapshotRepository;
  let run: ReturnType<typeof vi.fn>;
  let reads: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    database = new DatabaseSync(':memory:');
    run = vi.fn(async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).run(...parameters));
    reads = vi.fn(async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).all(...parameters));
    bridge.open.mockResolvedValue({
      execAsync: async (sql: string) => database.exec(sql),
      runAsync: run,
      getFirstAsync: async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).get(...parameters) ?? null,
      getAllAsync: reads,
      withTransactionAsync: async (task: () => Promise<void>) => {
        database.exec('BEGIN');
        try { await task(); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
      },
    });
    resetRrankerDatabaseForTests(); resetSnapshotSchemaForTests(); resetUserLibrarySchemaForTests();
    repository = new SqliteSnapshotRepository();
    await repository.initialize();
  });
  afterEach(() => database.close());

  it('measures encoded payload bytes, including Chinese and supplementary characters', async () => {
    const value = { title: '舞萌 DX', emoji: '🎵', empty: '' };
    await repository.saveResource('unicode', 1, 'now', value);
    expect(await repository.listResourceSizes()).toEqual([{ key: 'unicode', bytes: Buffer.byteLength(JSON.stringify(value)) }]);
    expect(database.prepare("SELECT length('舞萌 DX') chars, length(CAST('舞萌 DX' AS BLOB)) bytes").get())
      .toMatchObject({ chars: 5, bytes: 9 });
  });

  it('deletes 1201 keys in three bridge calls, deduplicates input and preserves unrelated rows', async () => {
    const keys = Array.from({ length: 1201 }, (_, index) => `key:${index}`);
    const insert = database.prepare('INSERT INTO resource_snapshots VALUES (?, 1, ?, ?)');
    for (const key of [...keys, 'keep']) insert.run(key, 'now', '{}');
    run.mockClear();
    await repository.clearResources([...keys, keys[0]]);
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map((call) => call.length - 1)).toEqual([500, 500, 201]);
    expect(await repository.listResourceSizes()).toEqual([{ key: 'keep', bytes: 2 }]);
  });

  it('rolls back every batch when a later delete fails', async () => {
    const keys = Array.from({ length: 501 }, (_, index) => String(index));
    const insert = database.prepare('INSERT INTO resource_snapshots VALUES (?, 1, ?, ?)');
    keys.forEach((key) => insert.run(key, 'now', '{}'));
    run.mockImplementationOnce(async (sql, ...args) => database.prepare(sql).run(...args))
      .mockRejectedValueOnce(new Error('disk failure'));
    await expect(repository.clearResources(keys)).rejects.toThrow('disk failure');
    expect((await repository.listResourceSizes()).length).toBe(501);
  });

  it('checks invalidation after asynchronous database initialization, before submitting a write', async () => {
    const guard = captureResourceWrites('integration-test');
    const pending = repository.saveResource('late', 1, 'now', {}, guard);
    invalidateResourceWrites('integration-test');
    await expect(pending).rejects.toThrow('缓存请求已失效');
    expect(await repository.getResource('late', 1)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
  it('keeps unrelated library and snapshot writes outside a failing clear transaction', async () => {
    const library = new SqliteUserLibraryRepository();
    await library.list();
    await repository.saveResource('clear-me', 1, 'now', {});
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    run.mockImplementationOnce(async (sql, ...args) => {
      database.prepare(sql).run(...args);
      reached.resolve(); await release.promise;
      throw new Error('clear failed');
    });
    const clearing = repository.clearResources(['clear-me']);
    const failure = expect(clearing).rejects.toThrow('clear failed');
    await reached.promise;
    const writing = repository.saveResource('unrelated', 1, 'now', { kept: true });
    const presets = library.setTagPresets(['舞萌 DX', '🎵']);
    // These writes must wait outside the open transaction.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(database.prepare("SELECT * FROM resource_snapshots WHERE resource_key = 'unrelated'").get()).toBeUndefined();
    release.resolve();
    await failure; await Promise.all([writing, presets]);
    expect(await repository.getResource('clear-me', 1)).toEqual({});
    expect(await repository.getResource('unrelated', 1)).toEqual({ kept: true });
    expect(await library.listTagPresets()).toEqual(['舞萌 DX', '🎵']);
  });

  it('rechecks cache generations after waiting for an unrelated database writer', async () => {
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocking = runDatabaseWrite(async () => { reached.resolve(); await release.promise; });
    await reached.promise;
    const guard = captureResourceWrites('queued-test');
    const pending = repository.saveResource('stale', 1, 'now', {}, guard);
    const failure = expect(pending).rejects.toThrow('缓存请求已失效');
    await new Promise((resolve) => setTimeout(resolve, 0));
    invalidateResourceWrites('queued-test'); release.resolve();
    await blocking; await failure;
    expect(await repository.getResource('stale', 1)).toBeNull();
  });

  it('keeps concurrent backup merges and single-item writes without losing updates', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    const song = (songId: string) => ({
      key: `song:maimai:${songId}`, gameId: 'maimai' as const, kind: 'song' as const,
      songId, favorite: true, tags: [], createdAt: at, updatedAt: at,
    });
    await library.mergeBackup({ items: [song('A')], presets: ['旧预设'] }, 'replace');
    await Promise.all([
      library.mergeBackup({ items: [song('C')], presets: ['新预设'] }, 'merge'),
      library.updateTarget({ kind: 'song', gameId: 'maimai', songId: 'B' }, () => song('B')),
    ]);
    expect((await library.list()).map((item) => item.key).sort())
      .toEqual(['song:maimai:A', 'song:maimai:B', 'song:maimai:C']);
    expect(await library.listTagPresets()).toEqual(['旧预设', '新预设']);
  });

  it('writes one favorite with constant bridge calls regardless of library size', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    const seed = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
      key: `song:maimai:${prefix}${index}`, gameId: 'maimai' as const, kind: 'song' as const,
      songId: `${prefix}${index}`, favorite: true, tags: ['甲', '乙'], createdAt: at, updatedAt: at,
    }));
    await library.mergeBackup({ items: seed('K', 200), presets: [] }, 'replace');
    const toggle = () => library.updateTarget(
      { kind: 'song', gameId: 'maimai', songId: 'K0' },
      (current) => {
        if (!current || current.kind !== 'song') throw new Error('missing seeded song');
        return { ...current, favorite: !current.favorite, updatedAt: '2026-09-24T00:00:01.000Z' };
      },
    );
    run.mockClear(); reads.mockClear();
    await toggle();
    // 1 行 upsert + 1 组关联删除 + 2 标签×(标签 upsert + 关联插入) + 1 次孤儿清理。
    expect(run).toHaveBeenCalledTimes(7);
    expect(reads.mock.calls.length).toBeLessThanOrEqual(4);
    await library.mergeBackup({ items: seed('J', 800), presets: [] }, 'merge');
    expect(await library.list()).toHaveLength(1000);
    run.mockClear(); reads.mockClear();
    await toggle();
    expect(run).toHaveBeenCalledTimes(7);
    expect(reads.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('removes the emptied row and prunes orphan tags on a single-target write', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    await library.mergeBackup({
      items: [{
        key: 'song:maimai:A', gameId: 'maimai', kind: 'song', songId: 'A',
        favorite: true, tags: ['独有', '共有'], createdAt: '2026-09-20T00:00:00.000Z', updatedAt: at,
      }, {
        key: 'song:maimai:B', gameId: 'maimai', kind: 'song', songId: 'B',
        favorite: true, tags: ['共有'], createdAt: at, updatedAt: at,
      }],
      presets: [],
    }, 'replace');
    run.mockClear();
    const result = await library.updateTarget(
      { kind: 'song', gameId: 'maimai', songId: 'A' },
      (current) => {
        if (!current || current.kind !== 'song') throw new Error('missing seeded song');
        return { ...current, favorite: false, tags: [], updatedAt: '2026-09-24T00:00:01.000Z' };
      },
    );
    // 关联删除 + 行删除 + 孤儿清理，不触碰其它行。
    expect(run).toHaveBeenCalledTimes(3);
    expect(result.map((item) => item.key)).toEqual(['song:maimai:B']);
    expect(result[0]).toMatchObject({ createdAt: at, tags: ['共有'] });
    expect(database.prepare('SELECT normalized_name AS name FROM user_library_tags ORDER BY name').all())
      .toEqual([{ name: '共有' }]);
  });

  it('clears one game without touching other games or presets', async () => {
    const library = new SqliteUserLibraryRepository();
    const at = '2026-09-24T00:00:00.000Z';
    await library.mergeBackup({
      items: [{
        key: 'song:maimai:A', gameId: 'maimai', kind: 'song', songId: 'A',
        favorite: true, tags: ['舞萌标签'], createdAt: at, updatedAt: at,
      }, {
        key: 'song:phigros:A', gameId: 'phigros', kind: 'song', songId: 'A',
        favorite: true, tags: ['Phigros 标签'], createdAt: at, updatedAt: at,
      }],
      presets: ['预设'],
    }, 'replace');
    expect((await library.list('maimai')).map((item) => item.key)).toEqual(['song:maimai:A']);
    const remaining = await library.clearGame('maimai');
    expect(remaining.map((item) => item.key)).toEqual(['song:phigros:A']);
    expect(await library.listTagPresets()).toEqual(['预设']);
    expect(database.prepare('SELECT normalized_name AS name FROM user_library_tags ORDER BY name').all())
      .toEqual([{ name: 'phigros 标签' }]);
  });

});
