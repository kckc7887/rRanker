import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runNativeStorageProbe, type NativeProbeResult } from '@/services/native-storage-probe';

const native = vi.hoisted(() => ({
  sqliteExec: vi.fn(), sqliteClose: vi.fn(), deleteDatabase: vi.fn(),
  coldSet: vi.fn(), coldClose: vi.fn(), secureSet: vi.fn(), secureDelete: vi.fn(),
  coldValues: new Map<string, string>(), defaultValues: new Map<string, string>(), secureValues: new Map<string, string>(),
  active: 0, maximum: 0,
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: native.sqliteExec, runAsync: async () => undefined,
    getFirstAsync: async () => ({ value: 'native-probe' }), closeAsync: native.sqliteClose,
  }),
  deleteDatabaseAsync: native.deleteDatabase,
}));
vi.mock('expo-sqlite/kv-store', () => ({
  default: {
    getItem: async (key: string) => native.defaultValues.get(key) ?? null,
    setItem: async (key: string, value: string) => { native.defaultValues.set(key, value); },
    removeItem: async (key: string) => { native.defaultValues.delete(key); },
    getAllKeys: async () => [...native.defaultValues.keys()],
  },
  SQLiteStorage: class {
    async setItem(key: string, value: string) {
      native.maximum = Math.max(native.maximum, ++native.active);
      try { await native.coldSet(key, value); native.coldValues.set(key, value); }
      finally { native.active--; }
    }
    async getItem(key: string) {
      native.maximum = Math.max(native.maximum, ++native.active);
      try { await Promise.resolve(); return native.coldValues.get(key) ?? null; }
      finally { native.active--; }
    }
    async removeItem(key: string) {
      native.maximum = Math.max(native.maximum, ++native.active);
      try { await Promise.resolve(); native.coldValues.delete(key); }
      finally { native.active--; }
    }
    async getAllKeys() { return [...native.coldValues.keys()]; }
    closeAsync = native.coldClose;
  },
}));
vi.mock('expo-secure-store', () => ({
  setItemAsync: async (key: string, value: string) => { await native.secureSet(); native.secureValues.set(key, value); },
  getItemAsync: async (key: string) => native.secureValues.get(key) ?? null,
  deleteItemAsync: async (key: string) => { await native.secureDelete(); native.secureValues.delete(key); },
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' }, getRandomBytesAsync: async () => new Uint8Array(32),
  digestStringAsync: async () => 'a'.repeat(64),
}));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    exists = false;
    private value = '';
    write(value: string) { this.value = value; this.exists = true; }
    async text() { return this.value; }
    delete() { this.exists = false; }
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  native.coldValues.clear(); native.defaultValues.clear(); native.secureValues.clear();
  native.active = 0; native.maximum = 0;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('native probe evidence quality', () => {
  it('checks six native round trips with forty cold consumers through one native execution owner', async () => {
    const results: NativeProbeResult[] = [];
    await runNativeStorageProbe((result) => results.push(result));
    expect(results.map((result) => [result.name, result.status])).toEqual([
      ['sqlite', 'pass'], ['kv-cold-concurrent', 'pass'], ['kv-default', 'pass'],
      ['secure-store', 'pass'], ['crypto', 'pass'], ['file-system', 'pass'],
    ]);
    expect(native.coldSet).toHaveBeenCalledTimes(40);
    expect(native.maximum).toBe(1);
    expect(native.coldValues.size).toBe(0);
    expect(native.coldClose).toHaveBeenCalledOnce();
  });

  it('keeps the primary operation failure when cleanup also fails', async () => {
    native.sqliteExec.mockRejectedValueOnce(new Error('primary prepare failure'));
    native.sqliteClose.mockRejectedValueOnce(new Error('secondary close failure'));
    const results: NativeProbeResult[] = [];
    await runNativeStorageProbe((result) => results.push(result));
    expect(results[0]).toEqual({ name: 'sqlite', status: 'fail', detail: 'operation: Error: primary prepare failure; cleanup: Error: secondary close failure' });
    expect(results).toHaveLength(6);
  });

  it('waits for every cold consumer before closing after a failure', async () => {
    let release!: () => void;
    native.coldSet.mockImplementation(async (key: string) => {
      if (key === 'probe-0') throw new Error('first statement failure');
      if (key === 'probe-39') await new Promise<void>((resolve) => { release = resolve; });
    });
    const results: NativeProbeResult[] = [];
    const task = runNativeStorageProbe((result) => results.push(result));
    await vi.waitFor(() => expect(native.coldSet).toHaveBeenCalledTimes(40));
    expect(native.coldClose).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    release();
    await task;
    expect(results[1].detail).toBe('operation: Error: first statement failure');
    expect(native.coldClose).toHaveBeenCalledOnce();
    expect(native.active).toBe(0);
  });

  it('reports a bounded timeout without prematurely closing an outstanding native call', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    native.sqliteExec.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const lateResult = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const results: NativeProbeResult[] = [];
    const task = runNativeStorageProbe((result) => results.push(result), { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(11);
    await task;
    expect(results).toHaveLength(6);
    expect(results[0].detail).toMatch(/^timeout: native operation still pending/u);
    expect(native.sqliteClose).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(native.sqliteClose).toHaveBeenCalledOnce();
    expect(lateResult).toHaveBeenCalledWith(expect.stringMatching(/^RRANKER_NATIVE_PROBE_COMPLETION /u));
    expect(results[0].status).toBe('fail');
  });

  it('labels cleanup-only failures without inventing an operation failure', async () => {
    native.secureDelete.mockRejectedValueOnce(new Error('delete failed'));
    const results: NativeProbeResult[] = [];
    await runNativeStorageProbe((result) => results.push(result));
    expect(results[3]).toEqual({ name: 'secure-store', status: 'fail', detail: 'cleanup: Error: delete failed' });
  });

  it('preserves an operation failure when its cleanup subsequently times out', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    native.sqliteExec.mockRejectedValueOnce(new Error('primary failure'));
    native.sqliteClose.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const results: NativeProbeResult[] = [];
    const task = runNativeStorageProbe((result) => results.push(result), { timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(11);
    await task;
    expect(results[0].detail).toBe('timeout: cleanup still pending; native operation settled; operation: Error: primary failure');
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toHaveLength(6);
  });
});
