import { SessionPersistenceError } from '@/domain/session-vault';

export const INDEX_KEY = 'rranker.provider.sessions.index.v4';

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
