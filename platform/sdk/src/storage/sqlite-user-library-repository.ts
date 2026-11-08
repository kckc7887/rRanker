import type { SQLiteDatabase } from 'expo-sqlite';
import {
  DEFAULT_TAG_PRESETS, libraryTargetKey, MAX_BACKUP_ITEMS, mergeLibraryItems,
  normalizeLibraryItem, normalizeTagPresets, shouldKeepLibraryItem, UserLibraryItemSchema,
} from '@rranker/sdk/domain/user-library';
import type { LibraryTarget, RestoreMode, UserLibraryItem } from '@rranker/sdk/domain/user-library';
import { getRrankerDatabase, runDatabaseWrite, runSerializedSchemaInit } from '@rranker/sdk/storage/rranker-database';

const USER_LIBRARY_SCHEMA_VERSION = 4;
type DatabaseAccess = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;
type ItemRow = {
  item_key: string; game_id: string; kind: 'song' | 'chart'; target_id: string;
  target_json: string; tags_json: string; is_saved: number; created_at: string; updated_at: string;
};
let schemaReady: Promise<void> | null = null;

async function writeTagPresets(db: DatabaseAccess, gameId: string, values: readonly string[]): Promise<void> {
  await db.runAsync(
    `INSERT INTO user_library_tag_presets (game_id, presets) VALUES (?, ?)
     ON CONFLICT(game_id) DO UPDATE SET presets=excluded.presets`,
    gameId, JSON.stringify(normalizeTagPresets(values)),
  );
}

async function readTagPresets(db: DatabaseAccess, gameId: string): Promise<string[]> {
  const row = await db.getFirstAsync<{ presets: string }>(
    'SELECT presets FROM user_library_tag_presets WHERE game_id = ?', gameId,
  );
  if (!row) return [...DEFAULT_TAG_PRESETS];
  try {
    const values: unknown = JSON.parse(row.presets);
    if (!Array.isArray(values) || !values.every(value => typeof value === 'string')) throw new Error('标签预设无效');
    return normalizeTagPresets(values);
  } catch {
    await writeTagPresets(db, gameId, DEFAULT_TAG_PRESETS);
    return [...DEFAULT_TAG_PRESETS];
  }
}

async function ensureUserLibrarySchema(): Promise<void> {
  schemaReady ??= runSerializedSchemaInit(async () => {
    const db = await getRrankerDatabase();
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'user_library_*'",
    );
    const columns = {
      user_library_meta: ['id', 'schema_version'],
      user_library_items: ['item_key', 'game_id', 'kind', 'target_id', 'target_json', 'tags_json', 'is_saved', 'created_at', 'updated_at'],
      user_library_tag_presets: ['game_id', 'presets'],
    };
    let current = tables.length === Object.keys(columns).length;
    for (const [name, expected] of Object.entries(columns)) {
      if (!tables.some(table => table.name === name)) { current = false; break; }
      const stored = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${name})`);
      if (stored.length !== expected.length || expected.some(column => !stored.some(entry => entry.name === column))) {
        current = false; break;
      }
    }
    if (current) {
      const row = await db.getFirstAsync<{ schema_version: number }>('SELECT schema_version FROM user_library_meta WHERE id = 1');
      current = row?.schema_version === USER_LIBRARY_SCHEMA_VERSION;
    }
    if (current) return;
    await db.execAsync('PRAGMA foreign_keys = OFF');
    try {
      await db.withTransactionAsync(async () => {
        for (const table of tables) await db.execAsync(`DROP TABLE "${table.name.replace(/"/g, '""')}"`);
        await db.execAsync(`
          CREATE TABLE user_library_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL
          );
          CREATE TABLE user_library_items (
            item_key TEXT PRIMARY KEY, game_id TEXT NOT NULL,
            kind TEXT NOT NULL CHECK (kind IN ('song', 'chart')),
            target_id TEXT NOT NULL, target_json TEXT NOT NULL, tags_json TEXT NOT NULL,
            is_saved INTEGER NOT NULL CHECK (is_saved IN (0, 1)),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          );
          CREATE INDEX user_library_items_game_id ON user_library_items(game_id);
          CREATE TABLE user_library_tag_presets (game_id TEXT PRIMARY KEY, presets TEXT NOT NULL);
        `);
        await db.runAsync('INSERT INTO user_library_meta (id, schema_version) VALUES (1, ?)', USER_LIBRARY_SCHEMA_VERSION);
      });
    } finally { await db.execAsync('PRAGMA foreign_keys = ON'); }
  }).catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

export class SqliteUserLibraryRepository {
  private initialize(): Promise<void> { return ensureUserLibrarySchema(); }

  async list(gameId?: string): Promise<UserLibraryItem[]> {
    await this.initialize();
    return runDatabaseWrite(async () => this.readFrom(await getRrankerDatabase(), gameId));
  }

  async listTagPresets(gameId: string): Promise<string[]> {
    await this.initialize();
    return runDatabaseWrite(async () => readTagPresets(await getRrankerDatabase(), gameId));
  }

  async setTagPresets(gameId: string, values: readonly string[]): Promise<string[]> {
    const normalized = normalizeTagPresets(values);
    await this.initialize();
    await runDatabaseWrite(async () => writeTagPresets(await getRrankerDatabase(), gameId, normalized));
    return normalized;
  }

  async readBackup(gameId: string): Promise<{ items: UserLibraryItem[]; tagPresets: string[] }> {
    await this.initialize();
    return runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      const [items, tagPresets] = await Promise.all([this.readFrom(db, gameId), readTagPresets(db, gameId)]);
      return { items, tagPresets };
    });
  }

  async mergeBackup(gameId: string, imported: { items: readonly UserLibraryItem[]; presets: readonly string[] }, mode: RestoreMode, signal?: AbortSignal): Promise<UserLibraryItem[]> {
    signal?.throwIfAborted();
    if (imported.items.some(item => item.gameId !== gameId)) throw new Error('备份包含其他游戏的数据');
    const normalizedImported = imported.items.map(normalizeLibraryItem).filter(shouldKeepLibraryItem);
    const importedPresets = normalizeTagPresets(imported.presets);
    await this.initialize();
    return runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      let result: UserLibraryItem[] = [];
      await db.withTransactionAsync(async () => {
        signal?.throwIfAborted();
        const [currentItems, currentPresets] = await Promise.all([this.readFrom(db, gameId), readTagPresets(db, gameId)]);
        result = mergeLibraryItems(mode === 'merge' ? currentItems : [], normalizedImported);
        if (result.length > MAX_BACKUP_ITEMS) throw new Error('备份条目超过上限');
        const nextPresets = normalizeTagPresets(mode === 'merge' ? [...currentPresets, ...importedPresets] : importedPresets);
        signal?.throwIfAborted();
        await db.runAsync('DELETE FROM user_library_items WHERE game_id = ?', gameId);
        for (const item of result) await this.writeItem(db, item);
        await writeTagPresets(db, gameId, nextPresets);
        signal?.throwIfAborted();
      });
      return result;
    });
  }

  async updateTarget(target: LibraryTarget, update: (current: UserLibraryItem | undefined) => UserLibraryItem): Promise<UserLibraryItem[]> {
    await this.initialize();
    return runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      let result: UserLibraryItem[] = [];
      await db.withTransactionAsync(async () => {
        const row = await db.getFirstAsync<ItemRow>('SELECT * FROM user_library_items WHERE item_key = ?', libraryTargetKey(target));
        const next = normalizeLibraryItem(update(row ? await this.readItem(db, row) : undefined));
        if (shouldKeepLibraryItem(next)) await this.writeItem(db, next);
        else await db.runAsync('DELETE FROM user_library_items WHERE item_key = ?', next.key);
        result = await this.readFrom(db, target.gameId);
      });
      return result;
    });
  }

  async clearGame(gameId: string): Promise<UserLibraryItem[]> {
    await this.initialize();
    return runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM user_library_items WHERE game_id = ?', gameId);
        await db.runAsync('DELETE FROM user_library_tag_presets WHERE game_id = ?', gameId);
      });
      return [];
    });
  }

  async measureBytes(): Promise<number> {
    await this.initialize();
    return runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      const [items, presets] = await Promise.all([
        db.getFirstAsync<{ bytes: number }>(`SELECT COALESCE(SUM(
          LENGTH(CAST(item_key AS BLOB)) + LENGTH(CAST(game_id AS BLOB)) + LENGTH(CAST(kind AS BLOB))
          + LENGTH(CAST(target_id AS BLOB)) + LENGTH(CAST(target_json AS BLOB)) + LENGTH(CAST(tags_json AS BLOB))
          + LENGTH(CAST(created_at AS BLOB)) + LENGTH(CAST(updated_at AS BLOB)) + 4
        ), 0) AS bytes FROM user_library_items`),
        db.getFirstAsync<{ bytes: number }>(`SELECT COALESCE(SUM(
          LENGTH(CAST(game_id AS BLOB)) + LENGTH(CAST(presets AS BLOB))
        ), 0) AS bytes FROM user_library_tag_presets`),
      ]);
      return (items?.bytes ?? 0) + (presets?.bytes ?? 0);
    });
  }

  private async readFrom(db: DatabaseAccess, gameId?: string): Promise<UserLibraryItem[]> {
    const rows = gameId === undefined
      ? await db.getAllAsync<ItemRow>('SELECT * FROM user_library_items ORDER BY item_key')
      : await db.getAllAsync<ItemRow>('SELECT * FROM user_library_items WHERE game_id = ? ORDER BY item_key', gameId);
    const items: UserLibraryItem[] = [];
    for (const row of rows) {
      const item = await this.readItem(db, row);
      if (item) items.push(item);
    }
    return items;
  }

  private async readItem(db: DatabaseAccess, row: ItemRow): Promise<UserLibraryItem | undefined> {
    try {
      const item = UserLibraryItemSchema.parse({
        key: row.item_key, gameId: row.game_id, kind: row.kind, id: row.target_id,
        target: JSON.parse(row.target_json), tags: JSON.parse(row.tags_json),
        createdAt: row.created_at, updatedAt: row.updated_at,
        ...(row.kind === 'song' ? { favorite: row.is_saved === 1 } : { practice: row.is_saved === 1 }),
      });
      if (libraryTargetKey(item) !== row.item_key) throw new Error('曲库条目身份无效');
      return normalizeLibraryItem(item);
    } catch {
      await db.runAsync('DELETE FROM user_library_items WHERE item_key = ?', row.item_key);
      return undefined;
    }
  }

  private async writeItem(db: DatabaseAccess, item: UserLibraryItem): Promise<void> {
    await db.runAsync(
      `INSERT INTO user_library_items (item_key, game_id, kind, target_id, target_json, tags_json, is_saved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_key) DO UPDATE SET target_json=excluded.target_json, tags_json=excluded.tags_json,
       is_saved=excluded.is_saved, created_at=excluded.created_at, updated_at=excluded.updated_at`,
      item.key, item.gameId, item.kind, item.id, JSON.stringify(item.target), JSON.stringify(item.tags),
      (item.kind === 'song' ? item.favorite : item.practice) ? 1 : 0, item.createdAt, item.updatedAt,
    );
  }
}
