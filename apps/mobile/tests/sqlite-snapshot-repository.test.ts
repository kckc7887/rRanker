const sqlite = vi.hoisted(() => {
  const db = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    runAsync: vi.fn().mockResolvedValue(undefined),
  };
  return { db, openDatabaseAsync: vi.fn(async () => db) };
});

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));

// The module must be imported after the hoisted native SQLite mock.
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { resetRrankerDatabaseForTests } from '@/storage/rranker-database';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import {
  resetSnapshotSchemaForTests,
  SqliteSnapshotRepository,
} from '@/storage/sqlite-snapshot-repository';

describe('SqliteSnapshotRepository schema migration', () => {
  beforeEach(() => {
    resetRrankerDatabaseForTests();
    resetSnapshotSchemaForTests();
    sqlite.openDatabaseAsync.mockClear();
    sqlite.db.execAsync.mockClear();
    sqlite.db.getFirstAsync.mockReset();
    sqlite.db.getAllAsync.mockReset();
    sqlite.db.runAsync.mockClear();
  });

  it('keeps an older score snapshot instead of deleting it', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 1, payload: '{"player":1}' });
    const repository = new SqliteSnapshotRepository();
    await expect(repository.getLatest('maimai:lxns:1')).resolves.toBeNull();
    expect(sqlite.db.runAsync).not.toHaveBeenCalledWith(
      'DELETE FROM account_score_snapshots WHERE account_id = ? AND payload = ? AND schema_version = ?',
      'maimai:lxns:1', '{"player":1}', 1,
    );
  });

  it('keeps a schema v4 snapshot that cannot be read as the current shape', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 4, payload: '{}' });
    const repository = new SqliteSnapshotRepository();
    await expect(repository.getLatest('maimai:lxns:frame')).resolves.toBeNull();
    expect(sqlite.db.runAsync).not.toHaveBeenCalledWith(
      'DELETE FROM account_score_snapshots WHERE account_id = ? AND payload = ? AND schema_version = ?',
      'maimai:lxns:frame', '{}', 4,
    );
  });

  it('keeps an unreadable catalog row', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 1, payload: '{not-json' });
    const repository = new SqliteSnapshotRepository();
    await expect(repository.getLatestCatalog()).resolves.toBeNull();
    expect(sqlite.db.runAsync).not.toHaveBeenCalled();
  });

  it('keeps an unreadable resource row', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 9, payload: '{}' });
    const repository = new SqliteSnapshotRepository();
    await expect(repository.getResource('chart:1', 3)).resolves.toBeNull();
    expect(sqlite.db.runAsync).not.toHaveBeenCalled();
  });

  it('clears one account or all score and catalog rows', async () => {
    const repository = new SqliteSnapshotRepository();
    await repository.clear('maimai:lxns:1');
    expect(sqlite.db.runAsync).toHaveBeenCalledWith(
      'DELETE FROM account_score_snapshots WHERE account_id = ?',
      'maimai:lxns:1',
    );
    sqlite.db.runAsync.mockClear();
    await repository.clear();
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('DELETE FROM score_snapshots WHERE id = ?', 1);
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('DELETE FROM account_score_snapshots');
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('DELETE FROM catalog_snapshots WHERE id = ?', 1);
  });

  it('opens the database once and runs schema init once across concurrent instances', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue(null);
    const a = new SqliteSnapshotRepository();
    const b = new SqliteSnapshotRepository();
    await Promise.all([
      a.getLatest('maimai:local:1'),
      b.getLatest('maimai:local:2'),
      a.getLatest('maimai:local:1'),
    ]);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledWith('rranker.db');
    expect(sqlite.db.execAsync).toHaveBeenCalledTimes(1);
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('account_score_snapshots'));
  });
});
