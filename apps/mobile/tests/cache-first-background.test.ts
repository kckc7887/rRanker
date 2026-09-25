import { describe, expect, it } from 'vitest';
import type { DataSource } from '@/domain/models';
import { cacheFirstLoad, cacheFirstLoadWithBackground } from '@/services/cache-first';
import { createInflightGuard } from '@/services/snapshot-cache-utils';
import { fixtureSource } from '@/fixtures/sanitized';

type Sourced = { source: DataSource };
const freshSource: DataSource = { ...fixtureSource, isStale: false };
const staleSource: DataSource = { ...fixtureSource, isStale: true, kind: 'cache' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('缓存优先的后台刷新句柄', () => {
  it('缓存命中时先返回打标缓存，句柄在后台刷新落定后给出成功终态', async () => {
    const cached = { source: staleSource, value: 'cached' };
    const load = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => cached,
      loadFresh: async () => ({ source: freshSource, value: 'fresh' }),
      onFresh: () => undefined,
    });

    expect(load.value).toMatchObject({ value: 'cached', source: { isStale: true } });
    const settled = await load.background;
    expect(settled.status).toBe('success');
    expect(settled.value).toMatchObject({ value: 'fresh' });
    expect(settled.metadata).toMatchObject({ provider: fixtureSource.kind, fetchedAt: fixtureSource.updatedAt });
  });

  it('后台刷新抛错时句柄给出失败终态，且不发布任何数据', async () => {
    const published: unknown[] = [];
    const load = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => ({ source: staleSource, value: 'cached' }),
      loadFresh: async () => { throw new Error('offline'); },
      onFresh: (value) => { published.push(value); },
      onRefreshFailed: (failure) => { published.push(failure); },
    });

    const settled = await load.background;
    expect(settled.status).toBe('failed');
    expect(settled.value).toBeNull();
    expect(settled.failures[0]).toMatchObject({ code: 'unknown' });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ code: 'unknown' });
  });

  it('后台返回兜底缓存时句柄给出失败终态并保留可继续使用的旧值', async () => {
    const fallback: Sourced & { value: string } = { source: staleSource, value: 'cached' };
    const load = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => fallback,
      loadFresh: async () => fallback,
      onFresh: () => undefined,
    });

    const settled = await load.background;
    expect(settled.status).toBe('failed');
    expect(settled.value).toMatchObject({ value: 'cached' });
    expect(settled.metadata).toBeNull();
  });

  it('取消整个消费者操作时句柄给出取消终态，不发布过期数据', async () => {
    const controller = new AbortController();
    const pending = deferred<Sourced & { value: string }>();
    const load = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => ({ source: staleSource, value: 'cached' }),
      loadFresh: () => pending.promise,
      onFresh: () => { throw new Error('取消后不得发布'); },
      signal: controller.signal,
    });

    controller.abort(new Error('后台刷新已取消'));
    pending.resolve({ source: freshSource, value: 'fresh' });
    const settled = await load.background;
    expect(settled.status).toBe('cancelled');
    expect(settled.value).toBeNull();
  });

  it('不传句柄时 cacheFirstLoad 的返回值与既有语义一致', async () => {
    const value = await cacheFirstLoad<Sourced & { value: string }>({
      loadCached: async () => ({ source: staleSource, value: 'cached' }),
      loadFresh: async () => ({ source: freshSource, value: 'fresh' }),
      onFresh: () => undefined,
    });
    expect(value).toMatchObject({ value: 'cached', source: { isStale: true } });
  });
});

describe('消费者取消与整个操作取消的区别', () => {
  it('取消一个消费者不会停止仍需要同一数据的另一个消费者', async () => {
    const guard = createInflightGuard<string>();
    const transport = deferred<Sourced & { value: string }>();
    const published: string[] = [];
    let requests = 0;
    const loadShared = (signal: AbortSignal) => guard.share<Sourced & { value: string }>('player:25', async () => {
      requests += 1;
      return transport.promise;
    }, signal);
    const consumerA = new AbortController();
    const consumerB = new AbortController();
    const cached = () => ({ source: staleSource, value: 'cached' });

    const first = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => cached(), loadFresh: loadShared, onFresh: () => published.push('A'), signal: consumerA.signal,
    });
    const second = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => cached(), loadFresh: loadShared, onFresh: () => published.push('B'), signal: consumerB.signal,
    });
    consumerA.abort(new Error('消费者 A 离开'));
    transport.resolve({ source: freshSource, value: 'shared' });

    expect((await first.background).status).toBe('cancelled');
    expect((await second.background).status).toBe('success');
    expect(published).toEqual(['B']);
    expect(requests).toBe(1);
  });

  it('取消整个操作时所有消费者都停止提交', async () => {
    const guard = createInflightGuard<string>();
    const transport = deferred<Sourced & { value: string }>();
    const published: string[] = [];
    const loadShared = (signal: AbortSignal) => guard.share<Sourced & { value: string }>('player:26', async (requestSignal) => {
      // 真实加载器会把共享信号交给上游请求；这里用同样的方式让「取消整个操作」生效。
      const cancel = () => transport.reject(requestSignal.reason ?? new Error('操作已取消'));
      requestSignal.addEventListener('abort', cancel, { once: true });
      try {
        return await transport.promise;
      } finally {
        requestSignal.removeEventListener('abort', cancel);
      }
    }, signal);
    const cached = () => ({ source: staleSource, value: 'cached' });

    const first = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => cached(), loadFresh: loadShared, onFresh: () => published.push('A'),
    });
    const second = await cacheFirstLoadWithBackground<Sourced & { value: string }>({
      loadCached: async () => cached(), loadFresh: loadShared, onFresh: () => published.push('B'),
    });
    guard.clear();

    expect((await first.background).status).not.toBe('success');
    expect((await second.background).status).not.toBe('success');
    expect(published).toEqual([]);
  });
});
