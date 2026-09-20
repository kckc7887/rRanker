import type { RizlineSave, RizlineSnapshot } from '@/domain/rizline';
import { rizlineUserIdFromAccountId } from '@/domain/bound-account';
import type { RizlineSession } from '@/providers/contracts';
import { isRizlineTokenExpired, RizlineProvider } from '@/providers/rizline-provider';
import { ProviderError } from '@/providers/errors';
import { applyRizlineSessionRotation, useSession } from '@/state/session-store';
import { deleteRizlinePassword, hasRizlinePassword, readRizlinePassword } from '@/storage/rizline-password-store';
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
  await Promise.all([repository.clearResources([rizlineAccountKey(id)]), deleteRizlinePassword(id)]);
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

function latestRizlineSession(id: string, fallback: RizlineSession): RizlineSession {
  const current = useSession.getState().sessionsByAccountId[id];
  return current?.mode === 'rizline' ? current : fallback;
}

function isAuthenticationError(error: unknown): error is ProviderError {
  return error instanceof ProviderError && error.code === 'authentication';
}

export async function loadRizlineFresh(id: string, session: RizlineSession, signal?: AbortSignal): Promise<RizlineSnapshot> {
  const key = `${resourceWriteGeneration('rizline')}:${resourceWriteGeneration(`account:${id}`)}:${id}`;
  return loads.share(key, async requestSignal => {
    const assertCurrent = captureResourceWrites('rizline', requestSignal, id);
    let expected = latestRizlineSession(id, session);
    if (isRizlineTokenExpired(expected.token) && !(await hasRizlinePassword(id))) {
      throw new ProviderError('authentication', '登录已失效，请重新登录', false);
    }
    const getSave = async (current: RizlineSession) => {
      expected = current;
      const provider = new RizlineProvider({
        session: current,
        allowExpiredToken: true,
        onSessionChanged: async next => {
          assertCurrent();
          await applyRizlineSessionRotation(id, next, expected, requestSignal);
          assertCurrent();
          expected = next;
        },
      });
      return provider.getSave(requestSignal);
    };
    const reauthWithPassword = async (error: ProviderError): Promise<RizlineSave> => {
      const password = await readRizlinePassword(id);
      if (!password) throw error;
      try {
        const current = latestRizlineSession(id, expected);
        const provider = new RizlineProvider({ session: current });
        const result = await provider.loginWithPassword(current.phone, password, requestSignal);
        assertCurrent();
        await applyRizlineSessionRotation(id, result.session, expected, requestSignal);
        assertCurrent();
        expected = result.session;
        return result.save;
      } catch (reauthError) {
        await deleteRizlinePassword(id);
        throw reauthError;
      }
    };
    let save: RizlineSave;
    try {
      save = await getSave(expected);
    } catch (error) {
      if (!isAuthenticationError(error)) throw error;
      const storeSession = latestRizlineSession(id, expected);
      if (storeSession.token !== expected.token) {
        try { save = await getSave(storeSession); }
        catch (retryError) {
          if (!isAuthenticationError(retryError)) throw retryError;
          save = await reauthWithPassword(retryError);
        }
      } else {
        save = await reauthWithPassword(error);
      }
    }
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
