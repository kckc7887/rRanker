import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'rranker.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;
let runtimeLogDatabasePromise: Promise<SQLiteDatabase> | null = null;

/** 日志使用独立连接，业务事务的回滚与等待不得影响崩溃前记录。 */
export function getRuntimeLogDatabase(): Promise<SQLiteDatabase> {
  if (!runtimeLogDatabasePromise) {
    runtimeLogDatabasePromise = SQLite.openDatabaseAsync('rranker-runtime-logs.db').catch((error) => {
      runtimeLogDatabasePromise = null;
      throw error;
    });
  }
  return runtimeLogDatabasePromise;
}
/** 同一连接的 schema、写入和事务共用队列，防止无关写入进入另一操作的事务。 */
let writeChain: Promise<void> = Promise.resolve();

/** 进程内唯一的 rranker.db 连接，避免 Android 多开触发 NativeDatabase NPE。 */
export function getRrankerDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** 调用前先完成仓库初始化；task 内不得再次进入该队列。失败不阻塞后续写入。 */
export function runDatabaseWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

/** schema 初始化与业务写入串行，仍由各仓库维护可重试的初始化锁。 */
export function runSerializedSchemaInit(task: () => Promise<void>): Promise<void> {
  return runDatabaseWrite(task);
}

/**
 * 清缓存收尾压缩：wal checkpoint + VACUUM，让 DELETE 后的数据库文件物理体积收缩。
 * 失败由调用方决定是否吞掉（体积不收缩不影响清除结果）。
 */
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

/** 读取 SQLite 物理页占用；WAL 在统计前先被动 checkpoint，失败仍可读取主库估算。 */
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

/** 测试用：重置单例与 schema 串行链。 */
export function resetRrankerDatabaseForTests(): void {
  databasePromise = null;
  writeChain = Promise.resolve();
}
