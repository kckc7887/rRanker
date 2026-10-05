import { LargeSecureValueStore } from '@/storage/large-secure-value-store';
import { SessionPersistenceError } from '@/domain/session-vault';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

const store = new LargeSecureValueStore();
const mutations = new Map<string, Promise<void>>();
const deletionGenerations = new Map<string, number>();

export type RizlinePasswordWriteOptions = { signal?: AbortSignal; assertCurrent?: () => void };

function serial<T>(reference: string, operation: () => Promise<T>): Promise<T> {
  const result = (mutations.get(reference) ?? Promise.resolve()).then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  mutations.set(reference, tail);
  return result.finally(() => {
    if (mutations.get(reference) === tail) {
      mutations.delete(reference);
      deletionGenerations.delete(reference);
    }
  });
}

async function credentialIo<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (cause) { throw new SessionPersistenceError('credential_storage', { cause }); }
}

function assertEligible(options?: RizlinePasswordWriteOptions): void {
  if (options?.signal?.aborted) throw options.signal.reason;
  options?.assertCurrent?.();
}

export function rizlinePasswordReference(accountId: string): string {
  return `rranker.secure.rizline-password.${accountId.replace(/[^a-z0-9._-]/giu, '-')}`;
}

export async function hasRizlinePassword(accountId: string): Promise<boolean> {
  const reference = rizlinePasswordReference(accountId);
  return serial(reference, () => credentialIo(() => store.has(reference)));
}

export async function readRizlinePassword(accountId: string): Promise<string | null> {
  const reference = rizlinePasswordReference(accountId);
  return serial(reference, () => credentialIo(() => store.read(reference)));
}

export async function writeRizlinePassword(accountId: string, password: string, options?: RizlinePasswordWriteOptions): Promise<void> {
  const reference = rizlinePasswordReference(accountId);
  const generation = deletionGenerations.get(reference) ?? 0;
  const assertCurrent = () => {
    assertEligible(options);
    if ((deletionGenerations.get(reference) ?? 0) !== generation) throw new Error('密码保存已失效');
  };
  return serial(reference, async () => {
    assertCurrent();
    const previous = await credentialIo(() => store.read(reference));
    assertCurrent();
    await credentialIo(() => store.write(reference, password));
    try { assertCurrent(); } catch (error) {
      try {
        if (previous === null) await credentialIo(() => store.delete(reference));
        else await credentialIo(() => store.write(reference, previous));
      } catch (rollbackError) {
        recordRuntimeError('rizline-password', rollbackError, false, { phase: 'rollback' });
      }
      throw error;
    }
  });
}

export async function deleteRizlinePassword(accountId: string, options?: RizlinePasswordWriteOptions): Promise<void> {
  assertEligible(options);
  const reference = rizlinePasswordReference(accountId);
  deletionGenerations.set(reference, (deletionGenerations.get(reference) ?? 0) + 1);
  return serial(reference, async () => {
    assertEligible(options);
    await credentialIo(() => store.delete(reference));
  });
}
