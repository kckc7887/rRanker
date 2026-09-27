/**
 * vitest 别名桩：真实 `expo-sqlite` 会加载 react-native（Flow 语法），
 * 在 node 测试环境无法解析。这里只提供被测试触达的最小接口。
 */
export type SQLiteDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: unknown): Promise<unknown>;
  getFirstAsync<T>(source: string, params?: unknown): Promise<T | null>;
  getAllAsync<T>(source: string, params?: unknown): Promise<T[]>;
  withExclusiveTransactionAsync(task: (tx: SQLiteDatabase) => Promise<void>): Promise<void>;
};

const database: SQLiteDatabase = {
  async execAsync() {},
  async runAsync() { return { changes: 0, lastInsertRowId: 0 }; },
  async getFirstAsync() { return null; },
  async getAllAsync() { return []; },
  async withExclusiveTransactionAsync(task) { await task(database); },
};

export async function openDatabaseAsync(): Promise<SQLiteDatabase> {
  return database;
}

export async function openDatabaseSync(): Promise<SQLiteDatabase> {
  return database;
}

export default { openDatabaseAsync, openDatabaseSync };
