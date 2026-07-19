import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_TAG_PRESETS, mergeLibraryItems, normalizeLibraryItem, normalizeTagName, normalizeTags, shouldKeepLibraryItem } from '@/domain/user-library';
import type { RestoreMode, UserLibraryItem } from '@/domain/user-library';
import type { UserLibraryRepository } from '@/repositories/user-library-repository';

const USER_LIBRARY_SCHEMA_VERSION = 2;
type DatabaseAccess = Pick<SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync'>;

interface ItemRow {
  item_key: string;
  kind: 'song' | 'chart';
  song_id: string;
  chart_type: 'SD' | 'DX' | null;
  level_index: number | null;
  is_favorite: number;
  is_practice: number;
  created_at: string;
  updated_at: string;
}

interface TagRow { item_key: string; display_name: string }

export class SqliteUserLibraryRepository implements UserLibraryRepository {
  private databasePromise = SQLite.openDatabaseAsync('rranker.db');
  private initialized?: Promise<void>;

  private initialize(): Promise<void> {
    if (!this.initialized) this.initialized = this.initializeDatabase();
    return this.initialized;
  }

  private async initializeDatabase(): Promise<void> {
    const db = await this.databasePromise;
    await db.execAsync(`PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS user_library_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_library_items (
        item_key TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('song', 'chart')),
        song_id TEXT NOT NULL, chart_type TEXT, level_index INTEGER,
        is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
        is_practice INTEGER NOT NULL DEFAULT 0 CHECK (is_practice IN (0, 1)),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        CHECK ((kind = 'song' AND chart_type IS NULL AND level_index IS NULL) OR
               (kind = 'chart' AND chart_type IN ('SD', 'DX') AND level_index >= 0))
      );
      CREATE TABLE IF NOT EXISTS user_library_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT, normalized_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_library_item_tags (
        item_key TEXT NOT NULL REFERENCES user_library_items(item_key) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES user_library_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (item_key, tag_id)
      );
      CREATE TABLE IF NOT EXISTS user_library_tag_presets (
        normalized_name TEXT PRIMARY KEY, display_name TEXT NOT NULL,
        sort_order INTEGER NOT NULL, created_at TEXT NOT NULL
      );`);
    const row = await db.getFirstAsync<{ schema_version: number }>('SELECT schema_version FROM user_library_meta WHERE id = 1');
    if (!row) {
      await db.runAsync('INSERT INTO user_library_meta (id, schema_version) VALUES (1, ?)', USER_LIBRARY_SCHEMA_VERSION);
      await this.writeTagPresets(db, DEFAULT_TAG_PRESETS);
    } else if (row.schema_version === 1) {
      await this.writeTagPresets(db, DEFAULT_TAG_PRESETS);
      await db.runAsync('UPDATE user_library_meta SET schema_version = ? WHERE id = 1', USER_LIBRARY_SCHEMA_VERSION);
    } else if (row.schema_version !== USER_LIBRARY_SCHEMA_VERSION) {
      throw new Error(`不支持的个人数据版本：${row?.schema_version ?? '未知'}`);
    }
  }

  async list(): Promise<UserLibraryItem[]> {
    await this.initialize();
    return this.readFrom(await this.databasePromise);
  }

  async listTagPresets(): Promise<string[]> {
    await this.initialize();
    const db = await this.databasePromise;
    const rows = await db.getAllAsync<{ display_name: string }>(
      'SELECT display_name FROM user_library_tag_presets ORDER BY sort_order, normalized_name',
    );
    return rows.map((row) => row.display_name);
  }

  async setTagPresets(values: readonly string[]): Promise<string[]> {
    await this.initialize();
    const normalized = normalizeTags(values);
    const db = await this.databasePromise;
    await db.withExclusiveTransactionAsync((txn) => this.writeTagPresets(txn, normalized));
    return normalized;
  }

  async update(transform: (items: UserLibraryItem[]) => UserLibraryItem[]): Promise<UserLibraryItem[]> {
    await this.initialize();
    const db = await this.databasePromise;
    let result: UserLibraryItem[] = [];
    await db.withExclusiveTransactionAsync(async (txn) => {
      result = transform(await this.readFrom(txn)).map(normalizeLibraryItem).filter(shouldKeepLibraryItem);
      await this.writeAll(txn, result);
    });
    return result;
  }

  async restore(items: UserLibraryItem[], mode: RestoreMode): Promise<UserLibraryItem[]> {
    await this.initialize();
    const db = await this.databasePromise;
    let result: UserLibraryItem[] = [];
    await db.withExclusiveTransactionAsync(async (txn) => {
      const imported = items.map(normalizeLibraryItem).filter(shouldKeepLibraryItem);
      result = mode === 'merge' ? mergeLibraryItems(await this.readFrom(txn), imported) : mergeLibraryItems([], imported);
      await this.writeAll(txn, result);
    });
    return result;
  }

  async clear(): Promise<void> {
    await this.initialize();
    const db = await this.databasePromise;
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync('DELETE FROM user_library_item_tags');
      await txn.runAsync('DELETE FROM user_library_items');
      await txn.runAsync('DELETE FROM user_library_tags');
      await this.writeTagPresets(txn, DEFAULT_TAG_PRESETS);
    });
  }

  private async writeTagPresets(db: DatabaseAccess, values: readonly string[]): Promise<void> {
    await db.runAsync('DELETE FROM user_library_tag_presets');
    const timestamp = new Date().toISOString();
    for (const [index, value] of normalizeTags(values).entries()) {
      const normalized = normalizeTagName(value);
      await db.runAsync(
        'INSERT INTO user_library_tag_presets (normalized_name, display_name, sort_order, created_at) VALUES (?, ?, ?, ?)',
        normalized.key, normalized.displayName, index, timestamp,
      );
    }
  }

  private async readFrom(db: DatabaseAccess): Promise<UserLibraryItem[]> {
    const [items, tags] = await Promise.all([
      db.getAllAsync<ItemRow>('SELECT * FROM user_library_items ORDER BY item_key'),
      db.getAllAsync<TagRow>(`SELECT it.item_key, t.display_name FROM user_library_item_tags it
        JOIN user_library_tags t ON t.id = it.tag_id ORDER BY it.item_key, t.normalized_name`),
    ]);
    const tagsByItem = new Map<string, string[]>();
    for (const row of tags) tagsByItem.set(row.item_key, [...(tagsByItem.get(row.item_key) ?? []), row.display_name]);
    return items.map((row): UserLibraryItem => row.kind === 'song'
      ? { key: row.item_key, kind: 'song', songId: row.song_id, favorite: row.is_favorite === 1,
        tags: tagsByItem.get(row.item_key) ?? [], createdAt: row.created_at, updatedAt: row.updated_at }
      : { key: row.item_key, kind: 'chart', songId: row.song_id, type: row.chart_type!, levelIndex: row.level_index!,
        practice: row.is_practice === 1, tags: tagsByItem.get(row.item_key) ?? [], createdAt: row.created_at, updatedAt: row.updated_at });
  }

  private async writeAll(db: DatabaseAccess, items: readonly UserLibraryItem[]): Promise<void> {
    await db.runAsync('DELETE FROM user_library_item_tags');
    await db.runAsync('DELETE FROM user_library_items');
    await db.runAsync('DELETE FROM user_library_tags');
    for (const rawItem of [...items].sort((a, b) => a.key.localeCompare(b.key))) {
      const item = normalizeLibraryItem(rawItem);
      await db.runAsync(
        `INSERT INTO user_library_items
          (item_key, kind, song_id, chart_type, level_index, is_favorite, is_practice, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.key, item.kind, item.songId, item.kind === 'chart' ? item.type : null,
        item.kind === 'chart' ? item.levelIndex : null, item.kind === 'song' && item.favorite ? 1 : 0,
        item.kind === 'chart' && item.practice ? 1 : 0, item.createdAt, item.updatedAt,
      );
      for (const tag of item.tags) {
        const normalized = normalizeTagName(tag);
        await db.runAsync(
          'INSERT OR IGNORE INTO user_library_tags (normalized_name, display_name, created_at) VALUES (?, ?, ?)',
          normalized.key, normalized.displayName, item.createdAt,
        );
        const tagRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM user_library_tags WHERE normalized_name = ?', normalized.key);
        if (!tagRow) throw new Error('无法保存标签');
        await db.runAsync('INSERT INTO user_library_item_tags (item_key, tag_id) VALUES (?, ?)', item.key, tagRow.id);
      }
    }
  }
}
