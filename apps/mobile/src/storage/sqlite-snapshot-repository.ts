import { accountAvatarResourceKey } from '@/domain/account-avatar';
import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import type { CatalogRepository } from '@/repositories/catalog-repository';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import type { ResourceRepository } from '@/repositories/resource-repository';
import { getRrankerDatabase, runSerializedSchemaInit } from '@/storage/rranker-database';

const SNAPSHOT_SCHEMA_VERSION = 5;
const CATALOG_SCHEMA_VERSION = 1;

function scoreResourceKey(accountId: string): string {
  return `score:${accountId}`;
}

let schemaReady: Promise<void> | null = null;

async function ensureSnapshotSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runSerializedSchemaInit(async () => {
      const db = await getRrankerDatabase();
      // 不切换 journal_mode：在单例连接上改 WAL 易与 withExclusiveTransactionAsync
      // 另开的连接互锁，Android 上会卡住原生队列并拖垮同步轮询。
      await db.execAsync(`
      CREATE TABLE IF NOT EXISTS score_snapshots (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS catalog_snapshots (
        id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, payload TEXT NOT NULL
      );
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

/** 测试用：重置模块级 schema 初始化锁。 */
export function resetSnapshotSchemaForTests(): void {
  schemaReady = null;
}

export class SqliteSnapshotRepository implements SnapshotRepository, CatalogRepository, ResourceRepository {
  private initialize(): Promise<void> {
    return ensureSnapshotSchema();
  }

  async getLatest(accountId: string): Promise<ScoreSnapshot | null> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
      'SELECT schema_version, payload FROM account_score_snapshots WHERE account_id = ?', accountId,
    );
    if (!row) return null;
    if (row.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
      await db.runAsync('DELETE FROM account_score_snapshots WHERE account_id = ?', accountId);
      return null;
    }
    try { return JSON.parse(row.payload) as ScoreSnapshot; }
    catch {
      await db.runAsync('DELETE FROM account_score_snapshots WHERE account_id = ?', accountId);
      return null;
    }
  }
  async save(accountId: string, snapshot: ScoreSnapshot): Promise<void> {
    await this.initialize();
    const db = await getRrankerDatabase();
    await db.runAsync(
      `INSERT INTO account_score_snapshots (account_id, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET schema_version=excluded.schema_version,
       updated_at=excluded.updated_at, payload=excluded.payload`,
      accountId, SNAPSHOT_SCHEMA_VERSION, snapshot.source.updatedAt, JSON.stringify(snapshot),
    );
    // 兼容删除旧单槽缓存，避免串号回退
    await db.runAsync('DELETE FROM score_snapshots WHERE id = ?', 1);
    await this.deleteResource(scoreResourceKey(accountId));
  }
  async getLatestCatalog(): Promise<CatalogSnapshot | null> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
      'SELECT schema_version, payload FROM catalog_snapshots WHERE id = ?', 1,
    );
    if (!row) return null;
    if (row.schema_version !== CATALOG_SCHEMA_VERSION) {
      await db.runAsync('DELETE FROM catalog_snapshots WHERE id = ?', 1);
      return null;
    }
    try { return JSON.parse(row.payload) as CatalogSnapshot; }
    catch { await db.runAsync('DELETE FROM catalog_snapshots WHERE id = ?', 1); return null; }
  }
  async saveCatalog(catalog: CatalogSnapshot): Promise<void> {
    await this.initialize();
    const db = await getRrankerDatabase();
    await db.runAsync(
      `INSERT INTO catalog_snapshots (id, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version,
       updated_at=excluded.updated_at, payload=excluded.payload`,
      1, CATALOG_SCHEMA_VERSION, catalog.source.updatedAt, JSON.stringify(catalog),
    );
  }
  async getResource<T>(key: string, schemaVersion: number): Promise<T | null> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ schema_version: number; payload: string }>(
      'SELECT schema_version, payload FROM resource_snapshots WHERE resource_key = ?', key,
    );
    if (!row) return null;
    if (row.schema_version !== schemaVersion) {
      await this.deleteResource(key);
      return null;
    }
    try { return JSON.parse(row.payload) as T; }
    catch {
      await this.deleteResource(key);
      return null;
    }
  }
  async saveResource<T>(key: string, schemaVersion: number, updatedAt: string, value: T): Promise<void> {
    await this.initialize();
    const db = await getRrankerDatabase();
    await db.runAsync(
      `INSERT INTO resource_snapshots (resource_key, schema_version, updated_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(resource_key) DO UPDATE SET schema_version=excluded.schema_version,
       updated_at=excluded.updated_at, payload=excluded.payload`,
      key, schemaVersion, updatedAt, JSON.stringify(value),
    );
  }
  async deleteResource(key: string): Promise<void> {
    await this.initialize();
    const db = await getRrankerDatabase();
    await db.runAsync('DELETE FROM resource_snapshots WHERE resource_key = ?', key);
  }

  async listAccountScoreSizes(): Promise<{ accountId: string; bytes: number }[]> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const rows = await db.getAllAsync<{ account_id: string; bytes: number }>(
      'SELECT account_id, LENGTH(payload) AS bytes FROM account_score_snapshots',
    );
    return rows.map((row) => ({ accountId: row.account_id, bytes: row.bytes ?? 0 }));
  }

  async listResourceSizes(): Promise<{ key: string; bytes: number }[]> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const rows = await db.getAllAsync<{ resource_key: string; bytes: number }>(
      'SELECT resource_key, LENGTH(payload) AS bytes FROM resource_snapshots',
    );
    return rows.map((row) => ({ key: row.resource_key, bytes: row.bytes ?? 0 }));
  }

  async measureCatalogBytes(): Promise<number> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ bytes: number }>(
      'SELECT LENGTH(payload) AS bytes FROM catalog_snapshots WHERE id = ?', 1,
    );
    return row?.bytes ?? 0;
  }

  async measureLegacyScoreBytes(): Promise<number> {
    await this.initialize();
    const db = await getRrankerDatabase();
    const row = await db.getFirstAsync<{ bytes: number }>(
      'SELECT LENGTH(payload) AS bytes FROM score_snapshots WHERE id = ?', 1,
    );
    return row?.bytes ?? 0;
  }

  async clearAccountScores(accountIds: readonly string[]): Promise<void> {
    if (accountIds.length === 0) return;
    await this.initialize();
    const db = await getRrankerDatabase();
    for (const accountId of accountIds) {
      await db.runAsync('DELETE FROM account_score_snapshots WHERE account_id = ?', accountId);
      await this.deleteResource(scoreResourceKey(accountId));
      await this.deleteResource(accountAvatarResourceKey(accountId));
    }
  }

  async clearResources(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.initialize();
    for (const key of keys) await this.deleteResource(key);
  }

  async clearCatalog(): Promise<void> {
    await this.initialize();
    const db = await getRrankerDatabase();
    await db.runAsync('DELETE FROM catalog_snapshots WHERE id = ?', 1);
    await db.runAsync('DELETE FROM score_snapshots WHERE id = ?', 1);
  }

  async clear(accountId?: string): Promise<void> {
    await this.initialize();
    const db = await getRrankerDatabase();
    if (accountId) {
      await db.runAsync('DELETE FROM account_score_snapshots WHERE account_id = ?', accountId);
      await this.deleteResource(scoreResourceKey(accountId));
      await this.deleteResource(accountAvatarResourceKey(accountId));
      return;
    }
    await db.runAsync('DELETE FROM score_snapshots WHERE id = ?', 1);
    await db.runAsync('DELETE FROM account_score_snapshots');
    await db.runAsync('DELETE FROM catalog_snapshots WHERE id = ?', 1);
    await db.runAsync('DELETE FROM resource_snapshots');
  }
}
