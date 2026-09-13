import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhigrosKyouAliasesSnapshot } from '@/domain/phigros-kyou';
import { loadPhigrosKyouAliases, resetPhigrosKyouAliasesCache, PHIGROS_KYOU_STALE_TIME_MS } from '@/services/phigros-kyou-cache';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';

const mocks = vi.hoisted(() => ({ getAliases: vi.fn<(signal?: AbortSignal) => Promise<PhigrosKyouAliasesSnapshot>>() }));
vi.mock('@/providers/phigros-kyou-provider', () => ({
  PhigrosKyouProvider: class { getAliases = mocks.getAliases; },
}));

function snapshot(name: string): PhigrosKyouAliasesSnapshot {
  return { songs: [], aliases: [], source: { kind: 'kyou', label: name, updatedAt: '2026-09-13T00:00:00.000Z', isStale: false } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('Phigros Kyou alias cache lifetime', () => {
  beforeEach(() => { resetPhigrosKyouAliasesCache(); mocks.getAliases.mockReset(); });
  afterEach(() => { resetPhigrosKyouAliasesCache(); vi.useRealTimers(); });

  it('shares one read while each consumer can cancel independently', async () => {
    const pending = deferred<PhigrosKyouAliasesSnapshot>();
    mocks.getAliases.mockReturnValue(pending.promise);
    const first = new AbortController();
    const second = new AbortController();
    const firstRead = loadPhigrosKyouAliases(first.signal);
    const secondRead = loadPhigrosKyouAliases(second.signal);
    await Promise.resolve();
    const cancelled = expect(firstRead).rejects.toThrow('first cancelled');
    first.abort(new Error('first cancelled'));
    await cancelled;
    expect(mocks.getAliases).toHaveBeenCalledTimes(1);
    expect(mocks.getAliases.mock.calls[0][0]?.aborted).toBe(false);
    const value = snapshot('shared');
    pending.resolve(value);
    await expect(secondRead).resolves.toBe(value);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(value);
    expect(mocks.getAliases).toHaveBeenCalledTimes(1);
  });

  it('aborts the last consumer and rejects a late result without replacing a newer cache', async () => {
    const old = deferred<PhigrosKyouAliasesSnapshot>();
    const fresh = snapshot('fresh');
    mocks.getAliases.mockReturnValueOnce(old.promise).mockResolvedValueOnce(fresh);
    const controller = new AbortController();
    const read = loadPhigrosKyouAliases(controller.signal);
    await Promise.resolve();
    const cancelled = expect(read).rejects.toThrow('cancelled');
    controller.abort(new Error('cancelled'));
    await cancelled;
    expect(mocks.getAliases.mock.calls[0][0]?.aborted).toBe(true);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(fresh);
    old.resolve(snapshot('old'));
    await Promise.resolve();
    await expect(loadPhigrosKyouAliases()).resolves.toBe(fresh);
    expect(mocks.getAliases).toHaveBeenCalledTimes(2);
  });

  it('does not let a cleared old failure evict a successful new cache', async () => {
    const old = deferred<PhigrosKyouAliasesSnapshot>();
    const fresh = snapshot('fresh');
    mocks.getAliases.mockReturnValueOnce(old.promise).mockResolvedValueOnce(fresh);
    const oldRead = loadPhigrosKyouAliases().catch((error: unknown) => error);
    await Promise.resolve();
    resetPhigrosKyouAliasesCache();
    expect(mocks.getAliases.mock.calls[0][0]?.aborted).toBe(true);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(fresh);
    const failure = new Error('old failure');
    old.reject(failure);
    expect(await oldRead).toBe(failure);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(fresh);
    expect(mocks.getAliases).toHaveBeenCalledTimes(2);
  });

  it('invalidates detached reads when the owning game cache is cleared', async () => {
    const pending = deferred<PhigrosKyouAliasesSnapshot>();
    mocks.getAliases.mockReturnValueOnce(pending.promise);
    const read = loadPhigrosKyouAliases();
    await Promise.resolve();
    invalidateResourceWrites('phigros');
    const invalidated = expect(read).rejects.toThrow('缓存请求已失效');
    pending.resolve(snapshot('old'));
    await invalidated;
    const fresh = snapshot('new generation');
    mocks.getAliases.mockResolvedValueOnce(fresh);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(fresh);
    expect(mocks.getAliases).toHaveBeenCalledTimes(2);
  });

  it('does not start queued work after the owning game generation changes', async () => {
    const read = loadPhigrosKyouAliases();
    invalidateResourceWrites('phigros');
    await expect(read).rejects.toThrow('缓存请求已失效');
    expect(mocks.getAliases).not.toHaveBeenCalled();
  });

  it('retains a successful result for one hour and retries after a failed refresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-13T00:00:00Z'));
    const value = snapshot('cached');
    const fresh = snapshot('fresh');
    mocks.getAliases.mockResolvedValueOnce(value)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(fresh);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(value);
    vi.setSystemTime(Date.now() + PHIGROS_KYOU_STALE_TIME_MS - 1);
    await expect(loadPhigrosKyouAliases()).resolves.toBe(value);
    expect(mocks.getAliases).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    await expect(loadPhigrosKyouAliases()).rejects.toThrow('offline');
    await expect(loadPhigrosKyouAliases()).resolves.toBe(fresh);
    expect(mocks.getAliases).toHaveBeenCalledTimes(3);
  });

  it('does not read for an already cancelled caller, even when a value is cached', async () => {
    mocks.getAliases.mockResolvedValue(snapshot('cached'));
    await loadPhigrosKyouAliases();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(loadPhigrosKyouAliases(controller.signal)).rejects.toThrow('cancelled');
    expect(mocks.getAliases).toHaveBeenCalledTimes(1);
  });
});
