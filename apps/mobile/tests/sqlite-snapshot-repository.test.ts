const sqlite = vi.hoisted(() => {
  const db = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(),
    runAsync: vi.fn().mockResolvedValue(undefined),
  };
  return { db, openDatabaseAsync: vi.fn(async () => db) };
});

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));

// The module must be imported after the hoisted native SQLite mock.
// eslint-disable-next-line import/first
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

describe('SqliteSnapshotRepository schema migration', () => {
  beforeEach(() => {
    sqlite.db.execAsync.mockClear();
    sqlite.db.getFirstAsync.mockReset();
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
});
