const sqlite = vi.hoisted(() => {
  const db = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(),
    getAllAsync: vi.fn(),
    runAsync: vi.fn().mockResolvedValue(undefined),
    withTransactionAsync: vi.fn(),
  };
  db.withTransactionAsync.mockImplementation(async (task: () => Promise<void>) => task());
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
    sqlite.db.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('sqlite_master')) {
        return [{
          name: 'user_library_items',
          sql: "CREATE TABLE user_library_items (chart_type TEXT CHECK (chart_type IN ('SD', 'DX', 'UTAGE')))",
        }, {
          name: 'user_library_item_tags',
          sql: 'CREATE TABLE user_library_item_tags (item_key TEXT, tag_id INTEGER)',
        }];
      }
      return [];
    });
    sqlite.db.runAsync.mockResolvedValue(undefined);
    sqlite.db.withTransactionAsync.mockImplementation(async (task: () => Promise<void>) => task());
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
    expect(sqlite.db.execAsync.mock.calls.some(
      (call) => String(call[0]).includes('journal_mode'),
    )).toBe(false);
  });
});
