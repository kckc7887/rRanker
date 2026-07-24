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
// eslint-disable-next-line import/first
import { resetRrankerDatabaseForTests } from '@/storage/rranker-database';
// eslint-disable-next-line import/first
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

  it('invalidates a schema v1 score snapshot for the account', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 1, payload: '{}' });
    const repository = new SqliteSnapshotRepository();
    await expect(repository.getLatest('maimai:lxns:1')).resolves.toBeNull();
    expect(sqlite.db.runAsync).toHaveBeenCalledWith(
      'DELETE FROM account_score_snapshots WHERE account_id = ?',
      'maimai:lxns:1',
    );
  });

  it('invalidates a schema v4 snapshot that predates strict actual/theoretical DXScore data', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 4, payload: '{}' });
    const repository = new SqliteSnapshotRepository();
    await expect(repository.getLatest('maimai:lxns:frame')).resolves.toBeNull();
    expect(sqlite.db.runAsync).toHaveBeenCalledWith(
      'DELETE FROM account_score_snapshots WHERE account_id = ?',
      'maimai:lxns:frame',
    );
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
