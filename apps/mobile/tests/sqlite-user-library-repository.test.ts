const sqlite = vi.hoisted(() => {
  const db = {
    execAsync: vi.fn().mockResolvedValue(undefined),
    getFirstAsync: vi.fn(), getAllAsync: vi.fn(), runAsync: vi.fn().mockResolvedValue(undefined),
    withTransactionAsync: vi.fn(),
  };
  db.withTransactionAsync.mockImplementation(async (task: () => Promise<void>) => task());
  return { db, openDatabaseAsync: vi.fn(async () => db) };
});

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));

// Native SQLite must be mocked before importing the repository.
// eslint-disable-next-line import/first
import { resetRrankerDatabaseForTests } from '@/storage/rranker-database';
// eslint-disable-next-line import/first
import {
  resetUserLibrarySchemaForTests,
  SqliteUserLibraryRepository,
} from '@/storage/sqlite-user-library-repository';

describe('SqliteUserLibraryRepository', () => {
  beforeEach(() => {
    resetRrankerDatabaseForTests();
    resetUserLibrarySchemaForTests();
    vi.clearAllMocks();
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 1 });
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

  it('creates independent versioned tables and reads an empty library', async () => {
    const repository = new SqliteUserLibraryRepository();
    await expect(repository.list()).resolves.toEqual([]);
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('user_library_meta'));
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining('PRAGMA foreign_keys = ON'));
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('UPDATE user_library_meta SET schema_version = ? WHERE id = 1', 4);
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('DELETE FROM user_library_items');
  });

  it('expands the chart type constraint in place while preserving items and tags', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 4 });
    sqlite.db.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('sqlite_master')) {
        return [{
          name: 'user_library_items',
          sql: "CREATE TABLE user_library_items (chart_type TEXT CHECK (chart_type IN ('SD', 'DX')))",
        }, {
          name: 'user_library_item_tags',
          sql: 'CREATE TABLE user_library_item_tags (item_key TEXT, tag_id INTEGER)',
        }];
      }
      return [];
    });

    const repository = new SqliteUserLibraryRepository();
    await expect(repository.list()).resolves.toEqual([]);

    expect(sqlite.db.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = OFF');
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
      'INSERT OR REPLACE INTO "user_library_items_utage_',
    ));
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
      "chart_type IN ('SD', 'DX', 'UTAGE')",
    ));
    expect(sqlite.db.execAsync).toHaveBeenCalledWith(expect.stringContaining(
      'INSERT OR IGNORE INTO "user_library_item_tags_utage_',
    ));
    expect(sqlite.db.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
    expect(sqlite.db.getAllAsync).toHaveBeenCalledWith('PRAGMA foreign_key_check');
  });

  it('recovers interrupted UTAGE migration tables without colliding with fixed legacy names', async () => {
    sqlite.db.getFirstAsync.mockResolvedValue({ schema_version: 4 });
    sqlite.db.getAllAsync.mockImplementation(async (sql: string) => {
      if (sql.includes('sqlite_master')) {
        return [{
          name: 'user_library_items',
          sql: "CREATE TABLE user_library_items (chart_type TEXT CHECK (chart_type IN ('SD', 'DX')))",
        }, {
          name: 'user_library_item_tags',
          sql: 'CREATE TABLE user_library_item_tags (item_key TEXT, tag_id INTEGER)',
        }, {
          name: 'user_library_items_legacy',
          sql: "CREATE TABLE user_library_items_legacy (chart_type TEXT CHECK (chart_type IN ('SD', 'DX')))",
        }, {
          name: 'user_library_item_tags_legacy',
          sql: 'CREATE TABLE user_library_item_tags_legacy (item_key TEXT, tag_id INTEGER)',
        }];
      }
      return [];
    });

    const repository = new SqliteUserLibraryRepository();
    await expect(repository.list()).resolves.toEqual([]);

    const migrationSql = sqlite.db.execAsync.mock.calls
      .map(([sql]) => sql as string)
      .find((sql) => sql.includes('INSERT OR REPLACE INTO "user_library_items_utage_'));
    expect(migrationSql).toContain('FROM "user_library_items" AS source');
    expect(migrationSql).toContain('FROM "user_library_items_legacy" AS source');
    expect(migrationSql).toContain('FROM "user_library_item_tags_legacy" AS source');
    expect(migrationSql).toContain('DROP TABLE "user_library_items_legacy"');
    expect(migrationSql).not.toContain('RENAME TO "user_library_items_legacy"');
  });

  it('clears personal tables inside a same-connection transaction', async () => {
    const repository = new SqliteUserLibraryRepository();
    await repository.clear();
    expect(sqlite.db.withTransactionAsync).toHaveBeenCalled();
    expect(sqlite.db.runAsync).toHaveBeenCalledWith('DELETE FROM user_library_items');
    expect(sqlite.db.runAsync).not.toHaveBeenCalledWith(expect.stringContaining('score_snapshots'));
  });

  it('writes a library item through the update transaction', async () => {
    const repository = new SqliteUserLibraryRepository();
    await repository.update(() => [{
      key: 'song:1', gameId: 'maimai', kind: 'song', songId: '1', favorite: true, tags: [],
      createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z',
    }]);
    expect(sqlite.db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_library_items'),
      'song:maimai:1', 'maimai', 'song', '1', null, null, 1, 0, '2026-07-13T00:00:00.000Z', '2026-07-13T00:00:00.000Z');
  });

  it('propagates transaction failure without reporting success', async () => {
    sqlite.db.withTransactionAsync.mockRejectedValueOnce(new Error('rollback'));
    const repository = new SqliteUserLibraryRepository();
    await expect(repository.restore([], 'replace')).rejects.toThrow('rollback');
  });

  it('opens the database once across concurrent repository instances', async () => {
    const a = new SqliteUserLibraryRepository();
    const b = new SqliteUserLibraryRepository();
    await Promise.all([a.list(), b.list(), a.list()]);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(sqlite.openDatabaseAsync).toHaveBeenCalledWith('rranker.db');
    expect(sqlite.db.execAsync).toHaveBeenCalledTimes(1);
  });
});
