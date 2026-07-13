const sqlite = vi.hoisted(() => {
  const db = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(), getAllAsync: vi.fn(), runAsync: vi.fn().mockResolvedValue(undefined),
    withExclusiveTransactionAsync: vi.fn(),
  };
  db.withExclusiveTransactionAsync.mockImplementation(async (task: (txn: typeof db) => Promise<void>) => task(db));
  return { db, openDatabaseAsync: vi.fn(async () => db) };
});

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));

// Native SQLite must be mocked before importing the repository.
// eslint-disable-next-line import/first
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';

describe('SqliteUserLibraryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 1 });
    sqlite.db.getAllAsync.mockResolvedValue([]);
    sqlite.db.runAsync.mockResolvedValue(undefined);
    sqlite.db.withExclusiveTransactionAsync.mockImplementation(async (task: (txn: typeof sqlite.db) => Promise<void>) => task(sqlite.db));
  });

  it('creates independent versioned tables and reads an empty library', async () => {
    const repository = new SqliteUserLibraryRepository();
    await expect(repository.list()).resolves.toEqual([]);
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('user_library_meta'));
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('PRAGMA foreign_keys = ON'));
  });

  it('clears personal tables inside an exclusive transaction', async () => {
    const repository = new SqliteUserLibraryRepository();
    await repository.clear();
    expect(sqlite.db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('DELETE FROM user_library_items');
    expect(sqlite.db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('score_snapshots'));
  });

  it('writes a library item through the exclusive update transaction', async () => {
    const repository = new SqliteUserLibraryRepository();
    await repository.update(() => [{
      key: 'song:1', kind: 'song', songId: '1', favorite: true, tags: [],
      createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z',
    }]);
    expect(sqlite.db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_library_items'),
      'song:1', 'song', '1', null, null, 1, 0, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z');
  });

  it('propagates transaction failure without reporting success', async () => {
    sqlite.db.withExclusiveTransactionAsync.mockRejectedValueOnce(new Error('rollback'));
    const repository = new SqliteUserLibraryRepository();
    await expect(repository.restore([], 'replace')).rejects.toThrow('rollback');
  });
});
