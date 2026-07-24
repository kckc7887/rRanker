const sqlite = vi.hoisted(() => {
  const db = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    runAsync: vi.fn().mockResolvedValue(undefined),
    withExclusiveTransactionAsync: vi.fn(),
  };
  db.withExclusiveTransactionAsync.mockImplementation(async (task: (txn: typeof db) => Promise<void>) => task(db));
  return { db, openDatabaseAsync: vi.fn(async () => db) };
});

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));

// eslint-disable-next-line import/first
import { resetRrankerDatabaseForTests } from '@/storage/rranker-database';
// eslint-disable-next-line import/first
import {
  resetSnapshotSchemaForTests,
  SqliteSnapshotRepository,
} from '@/storage/sqlite-snapshot-repository';
// eslint-disable-next-line import/first
import {
  resetUserLibrarySchemaForTests,
  SqliteUserLibraryRepository,
} from '@/storage/sqlite-user-library-repository';

describe('shared rranker.db access', () => {
  beforeEach(() => {
    resetRrankerDatabaseForTests();
    resetSnapshotSchemaForTests();
    resetUserLibrarySchemaForTests();
    vi.clearAllMocks();
    sqlite.db.getFirstAsync.mockResolvedValue(null);
    sqlite.db.getAllAsync.mockResolvedValue([]);
    sqlite.db.runAsync.mockResolvedValue(undefined);
    sqlite.db.withExclusiveTransactionAsync.mockImplementation(
      async (task: (txn: typeof sqlite.db) => Promise<void>) => task(sqlite.db),
    );
  });

  it('shares one open across snapshot and user-library first reads', async () => {
    const snapshots = new SqliteSnapshotRepository();
    const library = new SqliteUserLibraryRepository();
    await Promise.all([
      snapshots.getLatest('maimai:local:1'),
      library.list(),
    ]);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledWith('rranker.db');
    expect(sqlite.db.execAsync).toHaveBeenCalledTimes(2);
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('account_score_snapshots'));
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('user_library_meta'));
  });
});
