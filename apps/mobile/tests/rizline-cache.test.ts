import type { SourceClientContext } from '@rranker/sdk/credentials';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { commitCredential } from '@rranker/sdk/services/session-credential-service';
import { captureBoundAccountWrites } from '@rranker/sdk/services/account-write-scope';
import type { RizlineSession } from '@rranker/provider-rizline-official/credential';
import { DatabaseSync } from 'node:sqlite';
import { SqliteSnapshotRepository } from '@rranker/sdk/storage/sqlite-snapshot-repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheRizlineSave, clearRizlineAccount, loadRizlineCached, loadRizlineFresh, loadRizlineWithFallback } from '@rranker/provider-rizline-official/services/rizline-service';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { ProviderError } from '@rranker/sdk/providers/errors';

import { rizlineSave } from './fixtures/rizline';
const mocks = vi.hoisted(() => ({
  getSave: vi.fn(),
  loginWithPassword: vi.fn(),
  persist: vi.fn(),
  isExpired: vi.fn((_token?: string) => false),
  hasPassword: vi.fn(async (_id?: string) => false),
  readPassword: vi.fn(async (_id?: string) => null as string | null),
  deletePassword: vi.fn(async (_id?: string) => undefined),
  options: [] as { session?: RizlineSession; onSessionChanged?: (next: RizlineSession) => Promise<void>; allowExpiredToken?: boolean }[],
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
  constructor(options: { session?: RizlineSession; onSessionChanged?: (next: RizlineSession) => Promise<void>; allowExpiredToken?: boolean } = {}) { mocks.options.push(options); }
  getSave = mocks.getSave;
  loginWithPassword = mocks.loginWithPassword;
}, isRizlineTokenExpired: (token: string) => mocks.isExpired(token) }));
vi.mock('@rranker/sdk/storage/secure-session-store', () => ({ SecureSessionStore: class { updateCredentialSession = mocks.persist; } }));
vi.mock('@rranker/provider-rizline-official/storage/rizline-password-store', () => ({
  hasRizlinePassword: (id: string) => mocks.hasPassword(id),
  readRizlinePassword: (id: string) => mocks.readPassword(id),
  deleteRizlinePassword: (id: string) => mocks.deletePassword(id),
}));
const session: RizlineSession = { mode: 'rizline', token: 'token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true };
const accountA = 'rizline:official:user-a', accountB = 'rizline:official:user-b';

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
  mocks.options.length = 0;
  useAccountStore.getState().finishRestore(null);
  mocks.getSave.mockReset();
  mocks.loginWithPassword.mockReset();
  mocks.persist.mockReset();
  mocks.isExpired.mockReset();
  mocks.hasPassword.mockReset();
  mocks.readPassword.mockReset();
  mocks.deletePassword.mockReset();
  mocks.getSave.mockResolvedValue(rizlineSave());
  mocks.isExpired.mockReturnValue(false);
  mocks.hasPassword.mockResolvedValue(false);
  mocks.readPassword.mockResolvedValue(null);
  mocks.deletePassword.mockResolvedValue(undefined);
  mocks.persist.mockResolvedValue('applied');
});

describe('Rizline account snapshots', () => {
  it('persists the verified login save before a later offline score refresh', async () => {
    await cacheRizlineSave(accountA, rizlineSave());
    expect(mocks.getSave).not.toHaveBeenCalled();
    mocks.getSave.mockRejectedValue(new Error('offline'));
    expect(await loadRizlineWithFallback(sourceContext(accountA, session))).toMatchObject({ save: rizlineSave(), source: { isStale: true } });
    const cancelled = new AbortController(); cancelled.abort(new Error('login cancelled'));
    await expect(cacheRizlineSave(accountA, rizlineSave({ totalRks: 1 }), cancelled.signal)).rejects.toThrow('login cancelled');
    expect((await loadRizlineCached(accountA))?.save.totalRks).toBe(99.1234);
  });
  it('isolates accounts and preserves other accounts during removal', async () => {
    await loadRizlineFresh(sourceContext(accountA, session));
    mocks.getSave.mockResolvedValueOnce(rizlineSave({ userId: 'user-b' }));
    await loadRizlineFresh(sourceContext(accountB, session));
    await clearRizlineAccount(accountA); expect(await loadRizlineCached(accountA)).toBeNull(); expect(await loadRizlineCached(accountB)).not.toBeNull();
  });
  it('keeps offline data and distinguishes expired login from a network failure', async () => {
    await loadRizlineFresh(sourceContext(accountA, session));
    mocks.getSave.mockRejectedValue(new Error('offline'));
    expect(await loadRizlineWithFallback(sourceContext(accountA, session))).toMatchObject({ source: { isStale: true }, requiresLogin: false });
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', 'expired', false));
    expect(await loadRizlineWithFallback(sourceContext(accountA, session))).toMatchObject({ requiresLogin: true });
    expect((await loadRizlineCached(accountA))?.source.isStale).toBe(false);
  });
  it('keeps the original provider and fetch time when it falls back to the local snapshot', async () => {
    await loadRizlineFresh(sourceContext(accountA, session));
    const cached = await loadRizlineCached(accountA);
    mocks.getSave.mockRejectedValue(new Error('offline'));
    const fallback = await loadRizlineWithFallback(sourceContext(accountA, session));
    expect(fallback.source).toEqual({ ...cached!.source, isStale: true });
  });
  it('does not resurrect a removed account from a late save response', async () => {
    let complete!: (value: ReturnType<typeof rizlineSave>) => void;
    mocks.getSave.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const pending = loadRizlineFresh(sourceContext(accountA, session));
    await vi.waitFor(() => expect(mocks.getSave).toHaveBeenCalled());
    await clearRizlineAccount(accountA); complete(rizlineSave());
    await expect(pending).rejects.toThrow('缓存请求已失效'); expect(await loadRizlineCached(accountA)).toBeNull();
  });
  it('refuses to store another JWT user under the selected account id', async () => {
    await expect(loadRizlineFresh(sourceContext(accountB, session))).rejects.toMatchObject({ code: 'authentication' });
    expect(await loadRizlineCached(accountB)).toBeNull();
  });
  it('shares network work but keeps consumer cancellations independent', async () => {
    let complete!: (value: ReturnType<typeof rizlineSave>) => void;
    mocks.getSave.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const first = new AbortController(), second = new AbortController();
    const one = loadRizlineFresh(sourceContext(accountA, session), first.signal);
    const two = loadRizlineFresh(sourceContext(accountA, session), second.signal);
    await vi.waitFor(() => expect(mocks.getSave).toHaveBeenCalledTimes(1));
    first.abort(new Error('first cancelled'));
    await expect(one).rejects.toThrow('first cancelled');
    expect((mocks.getSave.mock.calls[0][0] as AbortSignal).aborted).toBe(false);
    complete(rizlineSave());
    await expect(two).resolves.toMatchObject({ save: { userId: 'user-a' } });
    expect(await loadRizlineCached(accountA)).not.toBeNull();
  });
  it('rejects a late response from before a rebind without replacing the new account snapshot', async () => {
    let complete!: (value: ReturnType<typeof rizlineSave>) => void;
    mocks.getSave.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const old = loadRizlineFresh(sourceContext(accountA, session));
    await vi.waitFor(() => expect(mocks.getSave).toHaveBeenCalledTimes(1));
    invalidateResourceWrites(`account:${accountA}`);
    mocks.getSave.mockResolvedValueOnce(rizlineSave({ totalRks: 150 }));
    useAccountStore.getState().updateCredential(`credential:${accountA}`, { ...session, token: 'new-login' });
    await loadRizlineFresh(sourceContext(accountA, session));
    complete(rizlineSave({ totalRks: 1 }));
    await expect(old).rejects.toThrow('缓存请求已失效');
    expect((await loadRizlineCached(accountA))?.save.totalRks).toBe(150);
  });

  it('retains refreshed credentials and scores while persistence waits for retry', async () => {
    mocks.persist.mockRejectedValueOnce(new Error('secure write failed'));
    mocks.getSave.mockImplementationOnce(async () => {
      await mocks.options[0]!.onSessionChanged?.({ ...session, token: 'rotated' });
      return rizlineSave();
    });
    await expect(loadRizlineFresh(sourceContext(accountA, session))).resolves.toMatchObject({ save: { userId: 'user-a' } });
    expect(await loadRizlineCached(accountA)).not.toBeNull();
    expect(useAccountStore.getState().credentialsById[`credential:${accountA}`]).toMatchObject({ token: 'rotated' });
  });
  it('retries with a store token after an authentication failure and does not require login', async () => {
    await cacheRizlineSave(accountA, rizlineSave());
    sourceContext(accountA, session);
    mocks.getSave.mockImplementationOnce(async () => {
      useAccountStore.getState().updateCredential(`credential:${accountA}`, { ...session, token: 'updated' });
      throw new ProviderError('authentication', 'expired', false);
    }).mockResolvedValueOnce(rizlineSave());
    const snapshot = await loadRizlineWithFallback(sourceContext(accountA, session));
    expect(snapshot).toMatchObject({ save: { userId: 'user-a' } });
    expect(snapshot.requiresLogin).toBeFalsy();
    expect(mocks.getSave).toHaveBeenCalledTimes(2);
    expect(mocks.options[1]?.session?.token).toBe('updated');
    expect(mocks.loginWithPassword).not.toHaveBeenCalled();
  });
  it('reauthenticates with a stored password after 401 and keeps the password', async () => {
    const next = { ...session, token: 'fresh-token' };
    mocks.readPassword.mockResolvedValue('stored-password');
    mocks.loginWithPassword.mockResolvedValue({
      session: next, save: rizlineSave(), player: { userId: 'user-a', username: 'x', totalRks: 99.1234 },
    });
    mocks.getSave.mockRejectedValueOnce(new ProviderError('authentication', 'expired', false));
    await expect(loadRizlineFresh(sourceContext(accountA, session))).resolves.toMatchObject({ save: { userId: 'user-a' } });
    expect(mocks.loginWithPassword).toHaveBeenCalledWith(session.phone, 'stored-password', expect.any(AbortSignal));
    expect(mocks.persist).toHaveBeenCalledWith(`credential:${accountA}`, next, { expected: session, assertCurrent: expect.any(Function) });
    expect(mocks.deletePassword).not.toHaveBeenCalled();
  });
  it('deletes the stored password when password reauthentication fails', async () => {
    await cacheRizlineSave(accountA, rizlineSave());
    mocks.readPassword.mockResolvedValue('stored-password');
    mocks.loginWithPassword.mockRejectedValue(new ProviderError('authentication', 'bad password', false));
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', 'expired', false));
    await expect(loadRizlineWithFallback(sourceContext(accountA, session))).resolves.toMatchObject({ requiresLogin: true });
  });
  it('still requests rn_login when a stored password exists for an expired JWT', async () => {
    mocks.isExpired.mockReturnValue(true);
    mocks.hasPassword.mockResolvedValue(true);
    await loadRizlineFresh(sourceContext(accountA, session));
    expect(mocks.getSave).toHaveBeenCalledTimes(1);
    expect(mocks.options[0]?.allowExpiredToken).toBe(true);
  });
  it.each([
    new ProviderError('network', 'offline', true),
    new DOMException('cancelled', 'AbortError'),
    new Error('local storage unavailable'),
  ])('keeps stored password after a transient reauthentication error', async error => {
    mocks.readPassword.mockResolvedValue('stored-password');
    mocks.getSave.mockRejectedValueOnce(new ProviderError('authentication', 'expired', false));
    mocks.loginWithPassword.mockRejectedValue(error);
    await expect(loadRizlineFresh(sourceContext(accountA, session))).rejects.toBe(error);
    expect(mocks.deletePassword).not.toHaveBeenCalled();
  });

});
