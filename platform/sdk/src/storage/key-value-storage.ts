import NativeStorage from 'expo-sqlite/kv-store';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

export interface KeyValueStorage extends KeyValueStore {
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

const mutationTails = new WeakMap<KeyValueStore, Map<string, Promise<void>>>();

export function enqueueKeyMutation<T>(storage: KeyValueStore, key: string, mutation: () => Promise<T>): Promise<T> {
  let tails = mutationTails.get(storage);
  if (!tails) {
    tails = new Map();
    mutationTails.set(storage, tails);
  }
  const previous = tails.get(key) ?? Promise.resolve();
  const result = previous.then(mutation, mutation);
  const tail = result.then(() => undefined, () => undefined);
  tails.set(key, tail);
  return result.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
}

const instances = new WeakMap<KeyValueStorage, KeyValueStorage>();

/** 同一原生实例串行执行，避免语句尚未释放就开始下一次操作。 */
export function createSerializedKeyValueStorage(storage: KeyValueStorage): KeyValueStorage {
  const existing = instances.get(storage);
  if (existing) return existing;
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
  const serialized: KeyValueStorage = {
    getItem: (key) => run(() => storage.getItem(key)),
    setItem: (key, value) => run(() => storage.setItem(key, value)),
    removeItem: (key) => run(() => storage.removeItem(key)),
    getAllKeys: () => run(() => storage.getAllKeys()),
  };
  instances.set(storage, serialized);
  instances.set(serialized, serialized);
  return serialized;
}

export default createSerializedKeyValueStorage(NativeStorage);
