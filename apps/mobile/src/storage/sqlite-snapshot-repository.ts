import type { z } from 'zod';
import type { SQLiteDatabase } from 'expo-sqlite';
import { accountAvatarResourceKey } from '@/domain/account-avatar';
import { chunithmPersonalResourceKey } from '@/domain/chunithm-personal';
import type { ScoreSnapshot } from '@/domain/models';
import { ScoreSnapshotSchema } from '@/domain/schemas';
import { getRrankerDatabase, runDatabaseWrite, runSerializedSchemaInit } from '@/storage/rranker-database';

const SNAPSHOT_SCHEMA_VERSION = 5;

let schemaReady: Promise<void> | null = null;

async function ensureSnapshotSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runSerializedSchemaInit(async () => {
      const db = await getRrankerDatabase();
      await db.execAsync(`
      CREATE TABLE IF NOT EXISTS resource_snapshots (
        resource_key TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_score_snapshots (
        account_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, payload TEXT NOT NULL
      );`);
    }).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export class SqliteSnapshotRepository {
  initialize(): Promise<void> {
    return ensureSnapshotSchema();
  }

  async getLatest(accountId: string): Promise<ScoreSnapshot | null> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
      'SELECT schema_version, payload FROM account_score_snapshots WHERE account_id = ?', accountId,
    );
    if (!row) return null;
    let snapshot: ScoreSnapshot | null = null;
    if (row.schema_version === SNAPSHOT_SCHEMA_VERSION) {
      try { snapshot = ScoreSnapshotSchema.safeParse(JSON.parse(row.payload)).data ?? null; }
      catch {}
    }
    if (snapshot) return snapshot;
    await runDatabaseWrite(() => db.runAsync(
      'DELETE FROM account_score_snapshots WHERE account_id = ? AND payload = ? AND schema_version = ?',
      accountId, row.payload, row.schema_version,
    ));
    return null;
  }
  async save(accountId: string, snapshot: ScoreSnapshot, assertCurrent?: () => void): Promise<void> {
    await this.initialize();
    await runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      assertCurrent?.();
      await db.runAsync(
        `INSERT INTO account_score_snapshots (account_id, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET schema_version=excluded.schema_version,
         updated_at=excluded.updated_at, payload=excluded.payload`,
        accountId, SNAPSHOT_SCHEMA_VERSION, snapshot.source.updatedAt, JSON.stringify(snapshot),
      );

    });
  }
  async getResource<T>(key: string, schemaVersion: number, schema?: z.ZodType<T>): Promise<T | null> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
      'SELECT schema_version, payload FROM resource_snapshots WHERE resource_key = ?', key,
    );
    if (!row) return null;
    const decoded = row.schema_version === schemaVersion ? parseResourcePayload<T>(row.payload) : null;
    const value = schema ? schema.safeParse(decoded).data ?? null : decoded;
    if (value !== null) return value;
    /** 只删除读到的失效行，保留排队期间覆盖的新值。 */
    await runDatabaseWrite(() => db.runAsync(
      'DELETE FROM resource_snapshots WHERE resource_key = ? AND payload = ? AND schema_version = ?',
      key, row.payload, row.schema_version,
    ));
    return null;
  }

  async updateResource<T>(
    key: string, schemaVersion: number,
    transform: (previous: T | null) => { value: T; updatedAt: string; write?: true } | { value: T; write: false },
    assertCurrent?: () => void,
  ): Promise<T> {
    await this.initialize();
    return runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
        'SELECT schema_version, payload FROM resource_snapshots WHERE resource_key = ?', key,
      );
      const previous = row && row.schema_version === schemaVersion ? parseResourcePayload<T>(row.payload) : null;
      if (row && previous === null) {
        await db.runAsync('DELETE FROM resource_snapshots WHERE resource_key = ?', key);
      }
      const result = transform(previous);
      assertCurrent?.();
      if (result.write === false) return result.value;
      const { value, updatedAt } = result;
      await db.runAsync(
        `INSERT INTO resource_snapshots (resource_key, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
         ON CONFLICT(resource_key) DO UPDATE SET schema_version=excluded.schema_version,
         updated_at=excluded.updated_at, payload=excluded.payload`,
        key, schemaVersion, updatedAt, JSON.stringify(value),
      );
      return value;
    });
  }
  async saveResource<T>(key: string, schemaVersion: number, updatedAt: string, value: T, assertCurrent?: () => void): Promise<void> {
    await this.initialize();
    await runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      assertCurrent?.();
      await db.runAsync(
        `INSERT INTO resource_snapshots (resource_key, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
         ON CONFLICT(resource_key) DO UPDATE SET schema_version=excluded.schema_version,
         updated_at=excluded.updated_at, payload=excluded.payload`,
        key, schemaVersion, updatedAt, JSON.stringify(value),
      );
    });
  }
  async deleteResource(key: string): Promise<void> {
    await this.initialize();
    await runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      await db.runAsync('DELETE FROM resource_snapshots WHERE resource_key = ?', key);
    });
  }

  async listAccountScoreSizes(): Promise<{ accountId: string; bytes: number }[]> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const rows = await db.getAllAsync<{ account_id: string; bytes: number }>(
      'SELECT account_id, LENGTH(CAST(payload AS BLOB)) AS bytes FROM account_score_snapshots',
    );
    return rows.map((row) => ({ accountId: row.account_id, bytes: row.bytes ?? 0 }));
  }

  async listResourceSizes(): Promise<{ key: string; bytes: number }[]> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const rows = await db.getAllAsync<{ resource_key: string; bytes: number }>(
      'SELECT resource_key, LENGTH(CAST(payload AS BLOB)) AS bytes FROM resource_snapshots',
    );
    return rows.map((row) => ({ key: row.resource_key, bytes: row.bytes ?? 0 }));
  }

  async clearAccountScores(accountIds: readonly string[]): Promise<void> {
    if (!accountIds.length) return;
    await this.initialize();
    await runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      const unique = [...new Set(accountIds)];
      await db.withTransactionAsync(async () => {
        await deleteKeys(db, 'account_score_snapshots', 'account_id', unique);
        await deleteKeys(db, 'resource_snapshots', 'resource_key', unique.flatMap((id) => [
          accountAvatarResourceKey(id), chunithmPersonalResourceKey(id),
        ]));
      });
    });
  }

  async clearResources(keys: readonly string[]): Promise<void> {
    if (!keys.length) return;
    await this.initialize();
    await runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      await db.withTransactionAsync(() => deleteKeys(db, 'resource_snapshots', 'resource_key', [...new Set(keys)]));
    });
  }

  async clear(accountId?: string): Promise<void> {
    await this.initialize();
    await runDatabaseWrite(async () => {
      const db = await getRrankerDatabase();
      if (accountId) {
        await db.runAsync('DELETE FROM account_score_snapshots WHERE account_id = ?', accountId);
        await db.runAsync('DELETE FROM resource_snapshots WHERE resource_key = ?', accountAvatarResourceKey(accountId));
        await db.runAsync('DELETE FROM resource_snapshots WHERE resource_key = ?', chunithmPersonalResourceKey(accountId));
        return;
      }
      await db.runAsync('DELETE FROM account_score_snapshots');
      await db.runAsync('DELETE FROM resource_snapshots');
    });
  }
}

function parseResourcePayload<T>(payload: string): T | null {
  try { return JSON.parse(payload) as T; }
  catch { return null; }
}

/** 每批最多 500 个参数，避开 SQLite 参数上限。 */
async function deleteKeys(db: SQLiteDatabase, table: 'account_score_snapshots' | 'resource_snapshots',
  column: 'account_id' | 'resource_key', keys: readonly string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += 500) {
    const chunk = keys.slice(index, index + 500);
    await db.runAsync(`DELETE FROM ${table} WHERE ${column} IN (${chunk.map(() => '?').join(',')})`, ...chunk);
  }
}
