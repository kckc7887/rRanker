import * as SQLite from 'expo-sqlite';
import type { ScoreSnapshot } from '@/domain/models';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { ProviderError } from '@/providers/errors';

const SCHEMA_VERSION = 1;
export class SqliteSnapshotRepository implements SnapshotRepository {
  private databasePromise = SQLite.openDatabaseAsync('rranker.db');
  async initialize(): Promise<void> {
    const db = await this.databasePromise;
    await db.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS score_snapshots (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, payload TEXT NOT NULL
      );`);
  }
  async getLatest(): Promise<ScoreSnapshot | null> {
    await this.initialize();
    const db = await this.databasePromise;
    const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
      'SELECT schema_version, payload FROM score_snapshots WHERE id = ?', 1,
    );
    if (!row) return null;
    if (row.schema_version !== SCHEMA_VERSION) {
      throw new ProviderError('cache_corrupt', '缓存版本无法读取，请重新同步', false);
    }
    try { return JSON.parse(row.payload) as ScoreSnapshot; }
    catch (error) { throw new ProviderError('cache_corrupt', '缓存内容已损坏，请重新同步', false, { cause: error }); }
  }
  async save(snapshot: ScoreSnapshot): Promise<void> {
    await this.initialize();
    const db = await this.databasePromise;
    await db.runAsync(
      `INSERT INTO score_snapshots (id, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version,
       updated_at=excluded.updated_at, payload=excluded.payload`,
      1, SCHEMA_VERSION, snapshot.source.updatedAt, JSON.stringify(snapshot),
    );
  }
  async clear(): Promise<void> {
    await this.initialize();
    const db = await this.databasePromise;
    await db.runAsync('DELETE FROM score_snapshots WHERE id = ?', 1);
  }
}
