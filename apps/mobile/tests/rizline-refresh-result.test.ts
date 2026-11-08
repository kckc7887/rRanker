import type { SourceClientContext } from '@rranker/sdk/credentials';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { commitCredential } from '@rranker/sdk/services/session-credential-service';
import { captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';
import type { RizlineSession } from '@rranker/provider-rizline-official/credential';
import { DatabaseSync } from 'node:sqlite';
import { SqliteSnapshotRepository } from '@rranker/sdk/storage/sqlite-snapshot-repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRizlineCached, refreshRizlineSnapshot } from '@rranker/provider-rizline-official/services/rizline-service';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { ProviderError } from '@rranker/sdk/providers/errors';

import {
  refreshNeedsLogin,
} from '@rranker/sdk/domain/refresh-result';
import { rizlineSave } from './fixtures/rizline';

const mocks = vi.hoisted(() => ({
  getSave: vi.fn(),
  loginWithPassword: vi.fn(),
  isExpired: vi.fn((_token?: string) => false),
  hasPassword: vi.fn(async (_id?: string) => false),
  readPassword: vi.fn(async (_id?: string) => null as string | null),
  deletePassword: vi.fn(async (_id?: string) => undefined),
}));
const database = new DatabaseSync(':memory:');
const repository = new SqliteSnapshotRepository();
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => database.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).get(...args) ?? null,
  getAllAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).all(...args),
  withTransactionAsync: async (task: () => Promise<void>) => {
    database.exec('BEGIN'); try { await task(); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  },
}) }));
afterAll(() => database.close());

vi.mock('@rranker/provider-rizline-official/providers/rizline-provider', async (importOriginal) => ({ ...(await importOriginal<typeof import('@rranker/provider-rizline-official/providers/rizline-provider')>()), RizlineProvider: class {
  getSave = mocks.getSave;
  loginWithPassword = mocks.loginWithPassword;
}, isRizlineTokenExpired: (token: string) => mocks.isExpired(token) }));
vi.mock('@rranker/sdk/storage/secure-session-store', () => ({ SecureSessionStore: class { async updateCredentialSession() { return 'applied'; } } }));
vi.mock('@rranker/provider-rizline-official/storage/rizline-password-store', () => ({
  hasRizlinePassword: (id: string) => mocks.hasPassword(id),
  readRizlinePassword: (id: string) => mocks.readPassword(id),
  deleteRizlinePassword: (id: string) => mocks.deletePassword(id),
}));

const session: RizlineSession = {
  mode: 'rizline', token: 'token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true,
};
const account = 'rizline:official:user-a';
const signal = () => new AbortController().signal;

function sourceContext(id: string, credential: RizlineSession): SourceClientContext {
  const credentialId = `credential:${id}`;
  if (!useAccountStore.getState().boundAccounts.some(account => account.id === id)) {
    useAccountStore.getState().bindAccounts({ accounts: [{ id, gameId: 'rizline', providerId: 'rizline-official',
      displayName: 'Player', scoreDisplay: '0', scoreLabel: '', providerTitle: '测试来源' }], credentialId, session: credential, activeAccountId: id });
  }
  const assertCurrent = captureBoundAccountWrites(id);
  return { account: useAccountStore.getState().boundAccounts.find(account => account.id === id)!,
    get credential() { return useAccountStore.getState().credentialsById[credentialId] ?? null; }, assertCurrent,
    commitCredential: (next, expected) => commitCredential({ credentialId, providerId: 'rizline-official', next, expected, assertCurrent }) };
}

beforeEach(async () => {
  invalidateResourceWrites('rizline');
  await repository.initialize();
  await repository.clearResources((await repository.listResourceSizes()).map(item => item.key));
  useAccountStore.getState().finishRestore(null);
  mocks.getSave.mockReset();
  mocks.loginWithPassword.mockReset();
  mocks.isExpired.mockReset();
  mocks.hasPassword.mockReset();
  mocks.readPassword.mockReset();
  mocks.getSave.mockResolvedValue(rizlineSave());
  mocks.isExpired.mockReturnValue(false);
  mocks.hasPassword.mockResolvedValue(false);
  mocks.readPassword.mockResolvedValue(null);
});

describe('Rizline refresh results', () => {
  it('reports a completed refresh with the original provider and a new fetch time', async () => {
    const result = await refreshRizlineSnapshot(sourceContext(account, session), signal());

    expect(result.status).toBe('success');

    expect(result.failures).toEqual([]);
    expect(result.requested).toEqual([account]);
    expect(result.completed).toEqual([account]);
    expect(result.value?.save.userId).toBe('user-a');
    expect(result.value?.source).toMatchObject({ kind: 'rizline-official', label: '官方账号', isStale: false });


  });

  it('keeps the old snapshot and its fetch time without calling it a success', async () => {
    await refreshRizlineSnapshot(sourceContext(account, session), signal());
    const cached = await loadRizlineCached(account);
    const cachedFetchedAt = cached!.source.updatedAt;
    mocks.getSave.mockRejectedValue(new Error('offline'));

    const result = await refreshRizlineSnapshot(sourceContext(account, session), signal());

    expect(result.status).toBe('failed');

    expect(result.failures).toEqual([{ code: 'unknown', target: account, diagnostic: 'offline', retryable: true }]);
    expect(refreshNeedsLogin(result)).toBe(false);

    expect(result.value?.save.totalRks).toBe(99.1234);
    expect(result.value?.source).toMatchObject({
      kind: 'rizline-official', label: '官方账号', updatedAt: cachedFetchedAt, isStale: true,
    });
    expect(result.metadata?.fetchedAt).toBe(cachedFetchedAt);

  });

  it('distinguishes an expired login from a network failure by error code', async () => {
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', '会话已过期', false));

    const expired = await refreshRizlineSnapshot(sourceContext(account, session), signal());

    expect(expired.status).toBe('failed');
    expect(expired.value).toBeNull();
    expect(expired.metadata).toBeNull();
    expect(refreshNeedsLogin(expired)).toBe(true);


    mocks.getSave.mockReset();
    mocks.getSave.mockRejectedValue(new ProviderError('network', '网络连接失败', true));
    const offline = await refreshRizlineSnapshot(sourceContext(account, session), signal());

    expect(refreshNeedsLogin(offline)).toBe(false);

  });

  it('reports cancellation instead of a failed refresh when the caller already cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new Error('同步已取消'));

    const result = await refreshRizlineSnapshot(sourceContext(account, session), controller.signal);

    expect(result.status).toBe('cancelled');
    expect(result.value).toBeNull();
    expect(result.metadata).toBeNull();
    expect(result.failures).toEqual([]);

    expect(mocks.getSave).not.toHaveBeenCalled();
  });
});
