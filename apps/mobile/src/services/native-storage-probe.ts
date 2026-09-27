import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { SQLiteStorage } from 'expo-sqlite/kv-store';
import Storage, { createSerializedKeyValueStorage } from '@/storage/key-value-storage';

export type NativeProbeResult = { name: string; status: 'pass' | 'fail'; detail: string };

type ProbeWork = { operation: () => Promise<void>; cleanup?: () => Promise<void> };
type ProbeProgress = { phase: 'operation' | 'cleanup'; failure?: string };

function errorDetail(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'Native operation failed';
}

async function settleProbe(name: string, work: ProbeWork, progress: ProbeProgress): Promise<NativeProbeResult> {
  try { await work.operation(); }
  catch (error) { progress.failure = `operation: ${errorDetail(error)}`; }
  progress.phase = 'cleanup';
  try { await work.cleanup?.(); }
  catch (error) {
    const cleanup = `cleanup: ${errorDetail(error)}`;
    progress.failure = progress.failure ? `${progress.failure}; ${cleanup}` : cleanup;
  }
  return { name, status: progress.failure ? 'fail' : 'pass', detail: (progress.failure ?? 'round-trip verified').slice(0, 1000) };
}

async function runProbe(
  name: string,
  work: ProbeWork,
  publish: (result: NativeProbeResult) => void,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const progress: ProbeProgress = { phase: 'operation' };
  const completion = settleProbe(name, work, progress).then((result) => {
    // Native calls cannot be cancelled. Cleanup remains attached to their completion.
    if (timedOut) console.info(`RRANKER_NATIVE_PROBE_COMPLETION ${JSON.stringify(result)}`);
    return result;
  });
  const timeout = new Promise<NativeProbeResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      const pending = progress.phase === 'operation'
        ? 'native operation still pending; cleanup waits for completion'
        : 'cleanup still pending; native operation settled';
      resolve({ name, status: 'fail', detail: `timeout: ${pending}${progress.failure ? `; ${progress.failure}` : ''}`.slice(0, 1000) });
    }, timeoutMs);
  });
  try { publish(await Promise.race([completion, timeout])); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Only temporary, generated probe keys are accessed; account data is never inspected. */
export async function runNativeStorageProbe(
  publish: (result: NativeProbeResult) => void,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const suffix = `${Date.now()}`;
  const key = `rranker.probe.${suffix}`;
  const databaseName = `rranker-probe-${suffix}.db`;
  const check = (condition: boolean) => { if (!condition) throw new Error('Native round-trip mismatch'); };
  const run = (name: string, work: ProbeWork) => runProbe(name, work, publish, options.timeoutMs ?? 15_000);
  let database: SQLite.SQLiteDatabase | undefined;
  await run('sqlite', {
    operation: async () => {
      database = await SQLite.openDatabaseAsync(databaseName);
      await database.execAsync('CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
      await database.runAsync('INSERT INTO probe (value) VALUES (?)', 'native-probe');
      check((await database.getFirstAsync<{ value: string }>('SELECT value FROM probe'))?.value === 'native-probe');
    },
    cleanup: async () => {
      if (!database) return;
      await database.closeAsync();
      await SQLite.deleteDatabaseAsync(databaseName);
    },
  });
  const coldName = `rranker-kv-probe-${suffix}.db`;
  let nativeColdStorage: SQLiteStorage | undefined;
  await run('kv-cold-concurrent', {
    operation: async () => {
      nativeColdStorage = new SQLiteStorage(coldName);
      const coldStorage = createSerializedKeyValueStorage(nativeColdStorage);
      let firstFailure: { error: unknown } | undefined;
      await Promise.allSettled(Array.from({ length: 40 }, async (_, index) => {
        await coldStorage.setItem(`probe-${index}`, String(index));
        check(await coldStorage.getItem(`probe-${index}`) === String(index));
        await coldStorage.removeItem(`probe-${index}`);
      }).map((task) => task.catch((error) => {
        firstFailure ??= { error };
        throw error;
      })));
      if (firstFailure) throw firstFailure.error;
    },
    cleanup: async () => {
      if (!nativeColdStorage) return;
      await nativeColdStorage.closeAsync();
      await SQLite.deleteDatabaseAsync(coldName);
    },
  });
  await run('kv-default', {
    operation: async () => { await Storage.setItem(key, 'native-probe'); check(await Storage.getItem(key) === 'native-probe'); },
    cleanup: async () => { await Storage.removeItem(key); },
  });
  await run('secure-store', {
    operation: async () => { await SecureStore.setItemAsync(key, 'native-probe'); check(await SecureStore.getItemAsync(key) === 'native-probe'); },
    cleanup: async () => { await SecureStore.deleteItemAsync(key); },
  });
  await run('crypto', {
    operation: async () => {
      check((await Crypto.getRandomBytesAsync(32)).length === 32);
      check((await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, 'native-probe')).length === 64);
    },
  });
  let file: File | undefined;
  await run('file-system', {
    operation: async () => {
      file = new File(Paths.cache, `rranker-probe-${suffix}.txt`);
      file.write('native-probe');
      check(await file.text() === 'native-probe');
    },
    cleanup: async () => { if (file?.exists) file.delete(); },
  });
}
