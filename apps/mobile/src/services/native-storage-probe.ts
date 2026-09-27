import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import Storage, { SQLiteStorage } from 'expo-sqlite/kv-store';

export type NativeProbeResult = { name: string; status: 'pass' | 'fail'; detail: string };

/** Only temporary, generated probe keys are accessed; account data is never inspected. */
export async function runNativeStorageProbe(publish: (result: NativeProbeResult) => void): Promise<void> {
  const suffix = `${Date.now()}`;
  const key = `rranker.probe.${suffix}`;
  const databaseName = `rranker-probe-${suffix}.db`;
  const check = (condition: boolean) => { if (!condition) throw new Error('Native round-trip mismatch'); };
  const run = async (name: string, operation: () => Promise<void>) => {
    try {
      await operation();
      publish({ name, status: 'pass', detail: 'round-trip verified' });
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'Native operation failed';
      publish({ name, status: 'fail', detail: detail.slice(0, 1000) });
    }
  };
  await run('sqlite', async () => {
    const db = await SQLite.openDatabaseAsync(databaseName);
    try {
      await db.execAsync('CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      await db.runAsync('INSERT INTO probe (value) VALUES (?)', 'native-probe');
      check((await db.getFirstAsync<{ value: string }>('SELECT value FROM probe'))?.value === 'native-probe');
    } finally { await db.closeAsync(); await SQLite.deleteDatabaseAsync(databaseName); }
  });
  await run('kv-cold-concurrent', async () => {
    const name = `rranker-kv-probe-${suffix}.db`;
    const storage = new SQLiteStorage(name);
    try {
      await Promise.all(Array.from({ length: 40 }, async (_, index) => {
        await storage.setItemAsync(`probe-${index}`, String(index));
        check(await storage.getItemAsync(`probe-${index}`) === String(index));
        await storage.removeItemAsync(`probe-${index}`);
      }));
    } finally { await storage.closeAsync(); await SQLite.deleteDatabaseAsync(name); }
  });
  await run('kv-default', async () => {
    try { await Storage.setItem(key, 'native-probe'); check(await Storage.getItem(key) === 'native-probe'); }
    finally { await Storage.removeItem(key); }
  });
  await run('secure-store', async () => {
    try { await SecureStore.setItemAsync(key, 'native-probe'); check(await SecureStore.getItemAsync(key) === 'native-probe'); }
    finally { await SecureStore.deleteItemAsync(key); }
  });
  await run('crypto', async () => {
    check((await Crypto.getRandomBytesAsync(32)).length === 32);
    check((await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'native-probe')).length === 64);
  });
  await run('file-system', async () => {
    const file = new File(Paths.cache, `rranker-probe-${suffix}.txt`);
    try { file.write('native-probe'); check(await file.text() === 'native-probe'); }
    finally { if (file.exists) file.delete(); }
  });
}
