import { describe, expect, it, vi } from 'vitest';
import { AbortController as NativeAbortController } from 'abort-controller';
import { captureResourceWrites, createInflightGuard, invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { loadItemsBounded } from '@/services/offset-pagination';
import { cacheFirstLoad } from '@/services/cache-first';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('shared resource lifetimes', () => {
  it('lets one consumer cancel while the other finishes one underlying request', async () => {
    const guard = createInflightGuard<string>();
    const first = new AbortController(), second = new AbortController();
    const work = deferred<string>();
    let underlying!: AbortSignal;
    const load = vi.fn((signal: AbortSignal) => { underlying = signal; return work.promise; });
    const one = guard.share('same', load, first.signal).catch(() => 'cancelled');
    const two = guard.share('same', load, second.signal);
    await Promise.resolve();
    first.abort();
    expect(await one).toBe('cancelled');
    expect(underlying.aborted).toBe(false);
    work.resolve('ready');
    expect(await two).toBe('ready');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('aborts the underlying request when its last consumer leaves', async () => {
    const guard = createInflightGuard<string>();
    const controller = new AbortController();
    let underlying!: AbortSignal;
    const pending = guard.share('same', (signal) => {
      underlying = signal;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('stopped'))));
    }, controller.signal).catch(() => undefined);
    await Promise.resolve();
    controller.abort();
    await pending;
    expect(underlying.aborted).toBe(true);
  });

  it('drains started writers before failing and does not claim queued work', async () => {
    const slow = deferred<void>(), failed = deferred<void>();
    const events: string[] = [];
    const load = vi.fn(async (item: number) => {
      events.push('start:' + item);
      await (item === 0 ? failed.promise : slow.promise);
      events.push('finish:' + item);
    });
    const pending = loadItemsBounded({ items: [0, 1, 2, 3], concurrency: 2, load, failureMode: 'throw' })
      .catch(() => { events.push('cleanup'); });
    failed.reject(new Error('first error'));
    await Promise.resolve(); await Promise.resolve();
    expect(events).toEqual(['start:0', 'start:1']);
    slow.resolve();
    await pending;
    expect(events).toEqual(['start:0', 'start:1', 'finish:1', 'cleanup']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps failure isolation as the default and uses the React Native abort polyfill', async () => {
    const failures = await loadItemsBounded({ items: [1, 2], concurrency: 1,
      load: async (item) => { if (item === 1) throw new Error('bad'); return item; },
    });
    expect(failures.map((item) => item.item)).toEqual([1]);
    const controller = new NativeAbortController();
    const signal = controller.signal as unknown as AbortSignal;
    const assertCurrent = captureResourceWrites('native-polyfill', signal);
    expect(() => assertCurrent()).not.toThrow();
    controller.abort();
    expect(() => assertCurrent()).toThrow();
    await expect(createInflightGuard<string>().share('native', async () => 1, signal)).rejects.toThrow('操作已取消');
    await expect(loadItemsBounded({ items: [1], concurrency: 1, signal, failureMode: 'throw', load: async () => 1 })).rejects.toThrow();
  });

  it('blocks detached refresh publication after its game cache is cleared', async () => {
    const fresh = deferred<{ source: { kind: 'generated'; label: string; updatedAt: string }; value: number }>();
    const source = { kind: 'generated' as const, label: 'sample', updatedAt: '2026-01-01' };
    const onFresh = vi.fn();
    await cacheFirstLoad({ loadCached: async () => ({ source, value: 1 }), loadFresh: () => fresh.promise,
      onFresh, assertCurrent: captureResourceWrites('fictional-game'),
    });
    invalidateResourceWrites('fictional-game');
    fresh.resolve({ source, value: 2 });
    await fresh.promise; await Promise.resolve();
    expect(onFresh).not.toHaveBeenCalled();
  });

  it('invalidates only the removed account and its old request guard', () => {
    const first = captureResourceWrites('fictional-game', undefined, 'one');
    const second = captureResourceWrites('fictional-game', undefined, 'two');
    invalidateResourceWrites('account:one');
    expect(first).toThrow();
    expect(second).not.toThrow();
  });
});
