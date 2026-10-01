import { SessionPersistenceError } from '@/domain/session-vault';
import Storage from '@/storage/key-value-storage';
import { parseSessionIndexOrThrow } from '@/storage/secure-session-codec';

export const LEGACY_SESSION_KEY = 'rranker.diving-fish.session.v1';
export const V2_VAULT_KEY = 'rranker.provider.sessions.v2';
export const VAULT_KEY = 'rranker.provider.sessions.v3';
export const INDEX_KEY = 'rranker.provider.sessions.index.v4';
export const INDEX_CORRUPT_KEY = `${INDEX_KEY}.corrupt`;
export const INDEX_UNRECOGNIZED_KEY = `${INDEX_KEY}.unrecognized`;
export const LEGACY_VAULT_KEYS = [VAULT_KEY, V2_VAULT_KEY, LEGACY_SESSION_KEY] as const;

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

const storageMutationTails = new WeakMap<KeyValueStore, Promise<void>>();

export function persistenceFailure(code: SessionPersistenceError['code'], cause: unknown): never {
  if (cause instanceof SessionPersistenceError || (cause instanceof Error && cause.name === 'AbortError')) throw cause;
  throw new SessionPersistenceError(code, { cause });
}

export async function persistenceOperation<T>(code: SessionPersistenceError['code'], operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (cause) { return persistenceFailure(code, cause); }
}

export function enqueueStorageMutation<T>(
  storage: KeyValueStore,
  mutation: () => Promise<T>,
): Promise<T> {
  const previous = storageMutationTails.get(storage) ?? Promise.resolve();
  const result = previous.then(mutation, mutation);
  const tail = result.then(() => undefined, () => undefined);
  storageMutationTails.set(storage, tail);
  return result.finally(() => {
    if (storageMutationTails.get(storage) === tail) storageMutationTails.delete(storage);
  });
}

/** 读取损坏或无法识别时保留的索引原文。没有副本时返回 null。 */
export async function readPreservedSessionIndex(
  storage: KeyValueStore = Storage,
): Promise<string | null> {
  return (await storage.getItem(INDEX_UNRECOGNIZED_KEY)) ?? (await storage.getItem(INDEX_CORRUPT_KEY));
}

/**
 * 只有保留副本重新解析通过才写回原键。当前索引可用时直接返回 false，不做任何写入。
 * 没有副本时返回 false；副本仍无法解析时抛出类型化错误，原键保持不动。
 */
export async function restorePreservedSessionIndex(
  storage: KeyValueStore = Storage,
): Promise<boolean> {
  return enqueueStorageMutation(storage, async () => {
    const currentRaw = await storage.getItem(INDEX_KEY);
    if (currentRaw) {
      try {
        parseSessionIndexOrThrow(currentRaw);
        return false;
      } catch {
        // 当前索引不可用，继续尝试用保留副本恢复。
      }
    }
    const preserved = await readPreservedSessionIndex(storage);
    if (!preserved) return false;
    parseSessionIndexOrThrow(preserved);
    await storage.setItem(INDEX_KEY, preserved);
    return true;
  });
}

