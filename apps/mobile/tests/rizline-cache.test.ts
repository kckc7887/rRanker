import { beforeEach, describe, expect, it, vi } from 'vitest';
import { awaitRizlineFresh, cacheRizlineSave, clearRizlineAccount, loadRizlineCached, loadRizlineFresh, loadRizlineWithFallback } from '@/services/rizline-service';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { ProviderError } from '@/providers/errors';
import type { RizlineSession } from '@/providers/contracts';
import { rizlineSave } from './fixtures/rizline';
const mocks = vi.hoisted(() => ({ values: new Map<string, unknown>(), getSave: vi.fn(), rotate: vi.fn(), options: [] as { onSessionChanged: (next: RizlineSession) => Promise<void> }[] }));
vi.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  async getResource(key: string) { return mocks.values.get(key) ?? null; }
  async saveResource(key: string, _version: number, _time: string, value: unknown, assertCurrent?: () => void) { assertCurrent?.(); mocks.values.set(key, value); }
  async clearResources(keys: string[]) { keys.forEach(key => mocks.values.delete(key)); }
} }));
vi.mock('@/providers/rizline-provider', () => ({ RizlineProvider: class {
  constructor(options: { onSessionChanged: (next: RizlineSession) => Promise<void> }) { mocks.options.push(options); }
  getSave = mocks.getSave;
} }));
vi.mock('@/state/session-store', () => ({ applyRizlineSessionRotation: mocks.rotate }));
const session: RizlineSession = { mode: 'rizline', token: 'token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true };
const accountA = 'rizline:official:user-a', accountB = 'rizline:official:user-b';
beforeEach(() => { invalidateResourceWrites('rizline'); mocks.values.clear(); mocks.options.length = 0; vi.clearAllMocks(); mocks.getSave.mockResolvedValue(rizlineSave()); });

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
  });
  it('keeps offline data and distinguishes expired login from a network failure', async () => {
    await loadRizlineFresh(accountA, session);
    mocks.getSave.mockRejectedValue(new Error('offline'));
    expect(await loadRizlineWithFallback(accountA, session)).toMatchObject({ source: { isStale: true }, requiresLogin: false });
    mocks.getSave.mockRejectedValue(new ProviderError('authentication', 'expired', false));
    expect(await loadRizlineWithFallback(accountA, session)).toMatchObject({ requiresLogin: true });
    expect((await loadRizlineCached(accountA))?.source.isStale).toBe(false);
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
      await mocks.options[0].onSessionChanged({ ...session, token: 'rotated' });
      return rizlineSave();
    });
    await expect(loadRizlineFresh(accountA, session)).rejects.toThrow('secure write failed');
    expect(await loadRizlineCached(accountA)).toBeNull();
  });
});
