import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'rranker.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

/** 进程内唯一的 rranker.db 连接，避免 Android 多开触发 NativeDatabase NPE。 */
export function getRrankerDatabase(): Promise<SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync(DATABASE_NAME);
  return databasePromise;
}

/** 测试用：重置单例，使下次 getRrankerDatabase 重新 open。 */
export function resetRrankerDatabaseForTests(): void {
  databasePromise = null;
}
