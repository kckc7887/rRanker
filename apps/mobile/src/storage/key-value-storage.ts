import NativeStorage from 'expo-sqlite/kv-store';

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<unknown>;
  getAllKeys(): Promise<string[]>;
};

const instances = new WeakMap<KeyValueStorage, KeyValueStorage>();

/** Own the complete native statement lifetime for each underlying KV instance. */
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
