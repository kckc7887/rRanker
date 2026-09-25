import { beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitRizlineFresh, cacheRizlineSave, clearRizlineAccount, loadRizlineCached, loadRizlineFresh, loadRizlineWithFallback } from '@/services/rizline-service';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { ProviderError } from '@/providers/errors';
import type { RizlineSession } from '@/providers/contracts';
import { rizlineSave } from './fixtures/rizline';
const mocks = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  getSave: vi.fn(),
  loginWithPassword: vi.fn(),
  rotate: vi.fn(),
  isExpired: vi.fn((_token?: string) => false),
  hasPassword: vi.fn(async (_id?: string) => false),
  readPassword: vi.fn(async (_id?: string) => null as string | null),
  deletePassword: vi.fn(async (_id?: string) => undefined),
  sessionsByAccountId: {} as Record<string, RizlineSession>,
  options: [] as { session?: RizlineSession; onSessionChanged?: (next: RizlineSession) => Promise<void>; allowExpiredToken?: boolean }[],
}));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  async getResource(key: string) { return mocks.values.get(key) ?? null; }
  async saveResource(key: string, _version: number, _time: string, value: unknown, assertCurrent?: () => void) { assertCurrent?.(); mocks.values.set(key, value); }
  async clearResources(keys: string[]) { keys.forEach(key => mocks.values.delete(key)); }
} }));
vi.mock('@/providers/rizline-provider', () => ({ RizlineProvider: class {
  constructor(options: { session?: RizlineSession; onSessionChanged?: (next: RizlineSession) => Promise<void>; allowExpiredToken?: boolean } = {}) { mocks.options.push(options); }
  getSave = mocks.getSave;
  loginWithPassword = mocks.loginWithPassword;
}, isRizlineTokenExpired: (token: string) => mocks.isExpired(token) }));
vi.mock('@/state/session-store', () => ({
  applyRizlineSessionRotation: mocks.rotate,
  useSession: { getState: () => ({ sessionsByAccountId: mocks.sessionsByAccountId }) },
}));
vi.mock('@/storage/rizline-password-store', () => ({
  hasRizlinePassword: (id: string) => mocks.hasPassword(id),
  readRizlinePassword: (id: string) => mocks.readPassword(id),
  deleteRizlinePassword: (id: string) => mocks.deletePassword(id),
}));
const session: RizlineSession = { mode: 'rizline', token: 'token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true };
const accountA = 'rizline:official:user-a', accountB = 'rizline:official:user-b';
beforeEach(() => {
  invalidateResourceWrites('rizline');
  mocks.values.clear();
  mocks.options.length = 0;
  mocks.sessionsByAccountId = {};
  mocks.getSave.mockReset();
  mocks.loginWithPassword.mockReset();
  mocks.rotate.mockReset();
  mocks.isExpired.mockReset();
  mocks.hasPassword.mockReset();
  mocks.readPassword.mockReset();
  mocks.deletePassword.mockReset();
  mocks.getSave.mockResolvedValue(rizlineSave());
  mocks.isExpired.mockReturnValue(false);
  mocks.hasPassword.mockResolvedValue(false);
  mocks.readPassword.mockResolvedValue(null);
  mocks.deletePassword.mockResolvedValue(undefined);
  mocks.rotate.mockResolvedValue(undefined);
});

describe('Rizline account snapshots', () => {
  it('persists the verified login save before a later offline score refresh', async () => {
    await cacheRizlineSave(accountA, rizlineSave());
    expect(mocks.getSave).not.toHaveBeenCalled();
    mocks.getSave.mockRejectedValue(new Error('offline'));
    expect(await loadRizlineWithFallback(accountA, session)).toMatchObject({ save: rizlineSave(), source: { isStale: true } });
    const cancelled = new AbortController(); cancelled.abort(new Error('login cancelled'));
    await expect(cacheRizlineSave(accountA, rizlineSave({ totalRks: 1 }), cancelled.signal)).rejects.toThrow('login cancelled');
    expect((await loadRizlineCached(accountA))?.save.totalRks).toBe(99.1234);
  });
  it('isolates accounts and preserves other accounts during removal', async () => {
    await loadRizlineFresh(accountA, session);
    mocks.getSave.mockResolvedValueOnce(rizlineSave({ userId: 'user-b' }));
    await loadRizlineFresh(accountB, session);
    await clearRizlineAccount(accountA); expect(await loadRizlineCached(accountA)).toBeNull(); expect(await loadRizlineCached(accountB)).not.toBeNull();
    expect(mocks.deletePassword).toHaveBeenCalledWith(accountA);
  });
  it('keeps offline data and distinguishes expired login from a network failure', async () => {
    await loadRizlineFresh(accountA, session);
    mocks.getSave.mockRejectedValue(new Error('offline'));
    expect(await loadRizlineWithFallback(accountA, session)).toMatchObject({ source: { isStale: true }, requiresLogin: false });
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', 'expired', false));
    expect(await loadRizlineWithFallback(accountA, session)).toMatchObject({ requiresLogin: true });
    expect((await loadRizlineCached(accountA))?.source.isStale).toBe(false);
  });
  it('keeps the original provider and fetch time when it falls back to the local snapshot', async () => {
    await loadRizlineFresh(accountA, session);
    const cached = await loadRizlineCached(accountA);
    mocks.getSave.mockRejectedValue(new Error('offline'));
    const fallback = await loadRizlineWithFallback(accountA, session);
    expect(fallback.source).toEqual({ ...cached!.source, isStale: true });
  });
  it('does not resurrect a removed account from a late save response', async () => {
    let complete!: (value: ReturnType<typeof rizlineSave>) => void;
    mocks.getSave.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const pending = loadRizlineFresh(accountA, session);
    await vi.waitFor(() => expect(mocks.getSave).toHaveBeenCalled());
    await clearRizlineAccount(accountA); complete(rizlineSave());
    await expect(pending).rejects.toThrow('缓存请求已失效'); expect(await loadRizlineCached(accountA)).toBeNull();
  });
  it('refuses to store another JWT user under the selected account id', async () => {
    await expect(loadRizlineFresh(accountB, session)).rejects.toMatchObject({ code: 'authentication' });
    expect(await loadRizlineCached(accountB)).toBeNull();
  });
  it('shares network work but keeps consumer cancellations independent', async () => {
    let complete!: (value: ReturnType<typeof rizlineSave>) => void;
    mocks.getSave.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const first = new AbortController(), second = new AbortController();
    const one = loadRizlineFresh(accountA, session, first.signal);
    const two = loadRizlineFresh(accountA, session, second.signal);
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
    const old = loadRizlineFresh(accountA, session);
    await vi.waitFor(() => expect(mocks.getSave).toHaveBeenCalledTimes(1));
    invalidateResourceWrites(`account:${accountA}`);
    mocks.getSave.mockResolvedValueOnce(rizlineSave({ totalRks: 150 }));
    await loadRizlineFresh(accountA, { ...session, token: 'new-login' });
    complete(rizlineSave({ totalRks: 1 }));
    await expect(old).rejects.toThrow('缓存请求已失效');
    expect((await loadRizlineCached(accountA))?.save.totalRks).toBe(150);
  });
  it('waits for an expired-token fallback before a manual sync decides its result', async () => {
    await loadRizlineFresh(accountA, session);
    let reject!: (error: unknown) => void;
    mocks.getSave.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const pending = loadRizlineWithFallback(accountA, session);
    let settled = false;
    const waiting = awaitRizlineFresh(accountA).then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    reject(new ProviderError('authentication', 'expired', false));
    await expect(pending).resolves.toMatchObject({ requiresLogin: true, source: { isStale: true } });
    await waiting; expect(settled).toBe(true);
  });
  it('keeps a credential persistence failure from committing fresh scores', async () => {
    mocks.rotate.mockRejectedValueOnce(new Error('secure write failed'));
    mocks.getSave.mockImplementationOnce(async () => {
      await mocks.options[0]!.onSessionChanged?.({ ...session, token: 'rotated' });
      return rizlineSave();
    });
    await expect(loadRizlineFresh(accountA, session)).rejects.toThrow('secure write failed');
    expect(await loadRizlineCached(accountA)).toBeNull();
  });
  it('retries with a store token after an authentication failure and does not require login', async () => {
    await cacheRizlineSave(accountA, rizlineSave());
    mocks.sessionsByAccountId[accountA] = session;
    mocks.getSave.mockImplementationOnce(async () => {
      mocks.sessionsByAccountId[accountA] = { ...session, token: 'updated' };
      throw new ProviderError('authentication', 'expired', false);
    }).mockResolvedValueOnce(rizlineSave());
    const snapshot = await loadRizlineWithFallback(accountA, session);
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
    await expect(loadRizlineFresh(accountA, session)).resolves.toMatchObject({ save: { userId: 'user-a' } });
    expect(mocks.loginWithPassword).toHaveBeenCalledWith(session.phone, 'stored-password', expect.any(AbortSignal));
    expect(mocks.rotate).toHaveBeenCalledWith(accountA, next, session, expect.any(AbortSignal));
    expect(mocks.deletePassword).not.toHaveBeenCalled();
  });
  it('deletes the stored password when password reauthentication fails', async () => {
    await cacheRizlineSave(accountA, rizlineSave());
    mocks.readPassword.mockResolvedValue('stored-password');
    mocks.loginWithPassword.mockRejectedValue(new ProviderError('authentication', 'bad password', false));
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', 'expired', false));
    await expect(loadRizlineWithFallback(accountA, session)).resolves.toMatchObject({ requiresLogin: true });
    expect(mocks.deletePassword).toHaveBeenCalledWith(accountA);
  });
  it('still requests rn_login when a stored password exists for an expired JWT', async () => {
    mocks.isExpired.mockReturnValue(true);
    mocks.hasPassword.mockResolvedValue(true);
    await loadRizlineFresh(accountA, session);
    expect(mocks.getSave).toHaveBeenCalledTimes(1);
    expect(mocks.options[0]?.allowExpiredToken).toBe(true);
  });
});
