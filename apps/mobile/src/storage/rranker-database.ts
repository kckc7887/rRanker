import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'rranker.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;
let runtimeLogDatabasePromise: Promise<SQLiteDatabase> | null = null;

/** 日志使用独立连接，避免业务事务影响崩溃前记录。 */
export function getRuntimeLogDatabase(): Promise<SQLiteDatabase> {
  if (!runtimeLogDatabasePromise) {
    runtimeLogDatabasePromise = SQLite.openDatabaseAsync('rranker-runtime-logs.db').catch((error) => {
      runtimeLogDatabasePromise = null;
      throw error;
    });
  }
  return runtimeLogDatabasePromise;
}
/** 同一连接的写入串行，避免混入其他事务；队列任务不能重入。 */
let writeChain: Promise<void> = Promise.resolve();
let runtimeLogWriteChain: Promise<void> = Promise.resolve();

export function getRrankerDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export function runDatabaseWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

export function runSerializedSchemaInit(task: () => Promise<void>, domain: 'business' | 'runtime-log' = 'business'): Promise<void> {
  if (domain === 'business') return runDatabaseWrite(task);
  const run = runtimeLogWriteChain.then(task, task);
  runtimeLogWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

export async function compactRrankerDatabase(): Promise<void> {
  await runDatabaseWrite(async () => {
    const db = await getRrankerDatabase();
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  });
}

export type RrankerDatabaseAllocation = {
  pageSize: number;
  pageCount: number;
  freePages: number;
  allocatedBytes: number;
  liveBytesEstimate: number;
};

/** WAL checkpoint 失败时只估算主库页占用。 */
export async function measureRrankerDatabaseAllocation(): Promise<RrankerDatabaseAllocation> {
  const db = await getRrankerDatabase();
  await db.execAsync('PRAGMA wal_checkpoint(PASSIVE);').catch(() => undefined);
  const [pageSizeRow, pageCountRow, freePagesRow] = await Promise.all([
    db.getFirstAsync<{ page_size: number }>('PRAGMA page_size'),
    db.getFirstAsync<{ page_count: number }>('PRAGMA page_count'),
    db.getFirstAsync<{ freelist_count: number }>('PRAGMA freelist_count'),
  ]);
  const pageSize = pageSizeRow?.page_size ?? 0;
  const pageCount = pageCountRow?.page_count ?? 0;
  const freePages = freePagesRow?.freelist_count ?? 0;
  return {
    pageSize,
    pageCount,
    freePages,
    allocatedBytes: pageSize * pageCount,
    liveBytesEstimate: pageSize * Math.max(0, pageCount - freePages),
  };
}
