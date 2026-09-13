import type { RizlineSave, RizlineSnapshot } from '@/domain/rizline';
import { rizlineUserIdFromAccountId } from '@/domain/bound-account';
import type { RizlineSession } from '@/providers/contracts';
import { RizlineProvider } from '@/providers/rizline-provider';
import { ProviderError } from '@/providers/errors';
import { applyRizlineSessionRotation } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { captureResourceWrites, createInflightGuard, invalidateResourceWrites, resourceWriteGeneration, snapshotSource } from './snapshot-cache-utils';
import { staleCached } from './cache-first';

const repository = new SqliteSnapshotRepository();
const loads = createInflightGuard<string>();
const freshByAccount = new Map<string, Promise<RizlineSnapshot>>();
export const rizlineAccountKey = (id: string) => `rizline:account:${id}`;
export function loadRizlineCached(id: string) { return repository.getResource<RizlineSnapshot>(rizlineAccountKey(id), 1); }
export async function clearRizlineAccount(id: string): Promise<void> {
  invalidateResourceWrites(`account:${id}`);
  await repository.clearResources([rizlineAccountKey(id)]);
}
export async function cacheRizlineSave(id: string, save: RizlineSave, signal?: AbortSignal): Promise<RizlineSnapshot> {
  const assertCurrent = captureResourceWrites('rizline', signal, id);
  assertCurrent();
  if (rizlineUserIdFromAccountId(id) !== save.userId) throw new ProviderError('authentication', 'Rizline account mismatch', false);
  const snapshot = { save, source: snapshotSource({ kind: 'rizline-official', label: '官方账号' }) };
  await repository.saveResource(rizlineAccountKey(id), 1, snapshot.source.updatedAt, snapshot, assertCurrent);
  assertCurrent();
  return snapshot;
}
export async function loadRizlineFresh(id: string, session: RizlineSession, signal?: AbortSignal): Promise<RizlineSnapshot> {
  const key = `${resourceWriteGeneration('rizline')}:${resourceWriteGeneration(`account:${id}`)}:${id}`;
  return loads.share(key, async requestSignal => {
    const assertCurrent = captureResourceWrites('rizline', requestSignal, id);
    let expected = session;
    const provider = new RizlineProvider({ session, onSessionChanged: async next => {
      assertCurrent();
      await applyRizlineSessionRotation(id, next, expected, requestSignal);
      assertCurrent();
      expected = next;
    } });
    const save = await provider.getSave(requestSignal);
    assertCurrent();
    return cacheRizlineSave(id, save, requestSignal);
  }, signal);
}
export function awaitRizlineFresh(id: string): Promise<void> {
  const fresh = freshByAccount.get(id);
  return fresh ? fresh.then(() => undefined, () => undefined) : Promise.resolve();
}

export function loadRizlineWithFallback(id: string, session: RizlineSession, signal?: AbortSignal): Promise<RizlineSnapshot> {
  const pending = (async () => {
    const assertCurrent = captureResourceWrites('rizline', signal, id);
    try { return await loadRizlineFresh(id, session, signal); }
    catch (error) {
      assertCurrent();
      const cached = await loadRizlineCached(id);
      assertCurrent();
      if (cached) return { ...staleCached(cached), requiresLogin: error instanceof ProviderError && error.code === 'authentication' };
      throw error;
    }
  })();
  freshByAccount.set(id, pending);
  const forget = () => { if (freshByAccount.get(id) === pending) freshByAccount.delete(id); };
  void pending.then(forget, forget);
  return pending;
}
