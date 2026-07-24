import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'rranker.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;
/** 串行化 schema 初始化，避免首启并发 execAsync / 换 journal mode 卡住原生队列。 */
let schemaChain: Promise<void> = Promise.resolve();

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

/**
 * 将 schema 初始化串到同一条 Promise 链上。
 * 失败不会卡住后续任务（链继续），由调用方自行管理可重试状态。
 */
export function runSerializedSchemaInit(task: () => Promise<void>): Promise<void> {
  const run = schemaChain.then(task, task);
  schemaChain = run.then(() => undefined, () => undefined);
  return run;
}

/** 测试用：重置单例与 schema 串行链。 */
export function resetRrankerDatabaseForTests(): void {
  databasePromise = null;
  schemaChain = Promise.resolve();
}
