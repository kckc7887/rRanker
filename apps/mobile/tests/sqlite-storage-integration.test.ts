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
  beforeEach(async () => {
    database = new DatabaseSync(':memory:');
    run = vi.fn(async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).run(...parameters));
    bridge.open.mockResolvedValue({
      execAsync: async (sql: string) => database.exec(sql),
      runAsync: run,
      getFirstAsync: async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).get(...parameters) ?? null,
      getAllAsync: async (sql: string, ...parameters: (string | number)[]) => database.prepare(sql).all(...parameters),
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

});
