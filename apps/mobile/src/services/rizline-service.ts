import type { RizlineSave, RizlineSnapshot } from '@/domain/rizline';
import { rizlineUserIdFromAccountId } from '@/domain/bound-account';
import type { RizlineSession } from '@/providers/contracts';
import { isRizlineTokenExpired, RizlineProvider } from '@/providers/rizline-provider';
import { ProviderError } from '@/providers/errors';
import { applyRizlineSessionRotation, useSession } from '@/state/session-store';
import { deleteRizlinePassword, hasRizlinePassword, readRizlinePassword } from '@/storage/rizline-password-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { captureResourceWrites, createInflightGuard, invalidateResourceWrites, resourceWriteGeneration, snapshotSource } from './snapshot-cache-utils';
import {
  cachedSnapshotSource,
  cancelledRefresh,
  failedRefresh,
  refreshFailureFromError,
  refreshNeedsLogin,
  snapshotMetadataOf,
  successfulRefresh,
  type RefreshResult,
} from '@/domain/refresh-result';

const repository = new SqliteSnapshotRepository();
const loads = createInflightGuard<string>();
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
        if (isAuthenticationError(reauthError)) {
          try { await deleteRizlinePassword(id, { signal: requestSignal, assertCurrent }); }
          catch (cleanupError) { recordRuntimeError('rizline-password', cleanupError, false, { phase: 'authentication-cleanup' }); }
        }
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

type RizlineRefreshAttempt = { result: RefreshResult<RizlineSnapshot, string>; error: unknown };

async function refreshRizline(
  id: string,
  session: RizlineSession,
  signal?: AbortSignal,
): Promise<RizlineRefreshAttempt> {
  const assertCurrent = captureResourceWrites('rizline', signal, id);
  try {
    const snapshot = await loadRizlineFresh(id, session, signal);
    assertCurrent();
    return {
      error: null,
      result: successfulRefresh<RizlineSnapshot, string>({
        value: snapshot, metadata: snapshotMetadataOf(snapshot.source), requested: [id],
      }),
    };
  } catch (error) {
    if (signal?.aborted) return { error, result: cancelledRefresh<RizlineSnapshot, string>([id]) };
    assertCurrent();
    const failure = refreshFailureFromError(error, id);
    const cached = await loadRizlineCached(id);
    assertCurrent();
    if (!cached) {
      return { error, result: failedRefresh<RizlineSnapshot, string>({ requested: [id], failures: [failure] }) };
    }
    const metadata = cached.source.kind === 'cache' ? null : snapshotMetadataOf(cached.source);
    return {
      error,
      result: failedRefresh<RizlineSnapshot, string>({
        value: { ...cached, source: cachedSnapshotSource(cached.source) },
        metadata,
        requested: [id],
        failures: [failure],
      }),
    };
  }
}

export async function refreshRizlineSnapshot(
  id: string,
  session: RizlineSession,
  signal?: AbortSignal,
): Promise<RefreshResult<RizlineSnapshot, string>> {
  return (await refreshRizline(id, session, signal)).result;
}

export function loadRizlineWithFallback(id: string, session: RizlineSession, signal?: AbortSignal): Promise<RizlineSnapshot> {
  const pending = (async () => {
    const { result, error } = await refreshRizline(id, session, signal);
    if (result.status === 'cancelled') throw signal?.reason ?? error ?? new Error('操作已取消');
    if (!result.value) throw error ?? new Error('Rizline 存档读取失败');
    return { ...result.value, requiresLogin: refreshNeedsLogin(result) };
  })();
  return pending;
}
