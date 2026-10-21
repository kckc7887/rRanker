import { describe, expect, it } from 'vitest';
import type { DataSource } from '@/domain/models';
import { cacheFirstLoad, cacheFirstLoadWithBackground, isCacheFallback, staleCached } from '@/services/cache-first';
import { ProviderError } from '@/providers/errors';
import { loadAliasedCatalog } from '@/services/aliased-catalog-query';
import { createInflightGuard } from '@/services/snapshot-cache-utils';
import { fixtureSource } from '@/fixtures/sanitized';
import { QueryClient } from '@tanstack/react-query';
import { publishEntityValue } from '@/services/game-data-query';

type Sourced = { source: DataSource };
const freshSource: DataSource = { ...fixtureSource, isStale: false };
const staleSource: DataSource = { ...fixtureSource, isStale: true, kind: 'cache' };

it('真实 QueryClient 首屏提交后再发布快响应后台新值', async () => {
  const client = new QueryClient();
  const queryKey = ['publication-race'];
  let background: Promise<unknown> | undefined;
  try {
    const first = await client.fetchQuery({ queryKey, queryFn: async ({ signal }) => {
      const load = await cacheFirstLoadWithBackground({
        loadCached: async () => ({ value: 1, source: freshSource }),
        loadFresh: async () => ({ value: 2, source: freshSource }),
        onFresh: fresh => publishEntityValue(client, queryKey, fresh), signal,
      });
      background = load.background;
      return load.value;
    } });
    expect(first.value).toBe(1);
    await background;
    expect(client.getQueryData(queryKey)).toMatchObject({ value: 2, source: { isStale: false } });
  } finally { client.clear(); }
});

it('失败订阅抛错也以RefreshResult结算，不产生拒绝', async () => {
  const load = await cacheFirstLoadWithBackground({
    loadCached: async () => ({ source: freshSource }),
    loadFresh: async () => { throw new Error('offline'); },
    onFresh: () => undefined,
    onRefreshFailed: () => { throw new Error('observer'); },
  });
  await expect(load.background).resolves.toMatchObject({ status: 'failed', failures: [{ target: 'data' }] });
});

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

  it('cacheFirstLoad 返回带暂存标记的缓存', async () => {
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

it('查询已移除时等待发布结算，迟到新值不重建查询', async () => {
  const client = new QueryClient();
  const key = ['removed-publication'];
  const pending = deferred<number>();
  const query = client.fetchQuery({ queryKey: key, queryFn: async ({ signal }) => { void signal; return pending.promise; } }).catch(() => undefined);
  const publishing = publishEntityValue(client, key, 2);
  client.clear();
  await publishing;
  pending.resolve(1);
  await query;
  expect(client.getQueryData(key)).toBeUndefined();
});

it('后台提交抛错返回失败终态，终态仍保留已取回的新值', async () => {
  const load = await cacheFirstLoadWithBackground({
    loadCached: async () => ({ source: freshSource, value: 1 }),
    loadFresh: async () => ({ source: freshSource, value: 2 }),
    onFresh: async () => { throw new Error('commit failed'); },
  });
  await expect(load.background).resolves.toMatchObject({ status: 'failed', value: { value: 2 }, failures: [{ diagnostic: 'commit failed' }] });
});

it('异步发布期间取消也按取消终态结算', async () => {
  const controller = new AbortController();
  const publication = deferred<void>();
  const started = deferred<void>();
  const load = await cacheFirstLoadWithBackground({
    loadCached: async () => ({ source: freshSource }),
    loadFresh: async () => ({ source: freshSource }),
    onFresh: () => { started.resolve(); return publication.promise; },
    signal: controller.signal,
  });
  await started.promise;
  controller.abort();
  publication.reject(new DOMException('aborted', 'AbortError'));
  await expect(load.background).resolves.toMatchObject({ status: 'cancelled' });
});


it('曲库与别名并行读取，别名失败仍返回曲库', async () => {
  const catalog = deferred<{ source: DataSource; value: number }>();
  const aliasesStarted = deferred<void>();
  const pending = loadAliasedCatalog({
    queryKey: ['catalog-test'], loadCached: async () => null,
    loadCatalog: () => catalog.promise,
    loadAliases: async (): Promise<{ source: DataSource; value: number }> => {
      aliasesStarted.resolve(); throw new Error('aliases unavailable');
    },
    mergeAliases: (value, aliases) => ({ ...value, value: value.value + (aliases?.value ?? 0) }),
    composeSource: value => value.source, onFresh: () => undefined,
  });
  await aliasesStarted.promise;
  catalog.resolve({ value: 42, source: freshSource });
  await expect(pending).resolves.toMatchObject({ value: 42 });
});

it.each([false, true])('没有缓存时等待联网结果，并拒绝取消后的迟到结果：%s', async cancel => {
  const controller = new AbortController();
  const fresh = deferred<Sourced & { value: number }>();
  const started = deferred<void>();
  const published: unknown[] = [];
  const pending = cacheFirstLoad({
    loadCached: async () => null,
    loadFresh: () => { started.resolve(); return fresh.promise; },
    onFresh: value => { published.push(value); }, signal: controller.signal,
  });
  await started.promise;
  if (cancel) controller.abort();
  fresh.resolve({ value: 2, source: freshSource });
  if (cancel) await expect(pending).rejects.toThrow();
  else await expect(pending).resolves.toMatchObject({ value: 2, source: { isStale: false } });
  expect(published).toEqual([]);
});

it.each([false, true])('服务声明回退时保留旧值，只通知仍活动的消费者：%s', async cancel => {
  const controller = new AbortController();
  const fresh = deferred<Sourced & { value: number }>();
  const fallback = { value: 1, source: freshSource };
  const published: unknown[] = [];
  const fallbackEvents: unknown[] = [];
  const load = await cacheFirstLoadWithBackground({
    loadCached: async () => fallback, loadFresh: () => fresh.promise,
    isFallback: value => value === fallback,
    onFresh: value => { published.push(value); },
    onFallback: (value, failure) => { fallbackEvents.push([value, failure]); },
    signal: controller.signal,
  });
  if (cancel) controller.abort();
  fresh.resolve(fallback);
  await load.background;
  expect(load.value.value).toBe(1);
  expect(published).toEqual([]);
  expect(fallbackEvents).toEqual(cancel ? [] : [[fallback, null]]);
});

it.each([false, true])('刷新失败保留错误码，取消后不再通知：%s', async cancel => {
  const controller = new AbortController();
  const fresh = deferred<Sourced>();
  const failures: unknown[] = [];
  const load = await cacheFirstLoadWithBackground({
    loadCached: async () => ({ source: freshSource }), loadFresh: () => fresh.promise,
    onFresh: () => { throw new Error('失败响应不得发布'); },
    onRefreshFailed: failure => { failures.push(failure); }, signal: controller.signal,
  });
  if (cancel) controller.abort();
  fresh.reject(new ProviderError('authentication', '登录状态已变化', false));
  await load.background;
  expect(failures).toEqual(cancel ? [] : [{ code: 'authentication', target: null, diagnostic: '登录状态已变化', retryable: false }]);
});

it('多来源暂存标记保留原提供方与抓取时间', async () => {
  const payload = { source: freshSource, catalogSource: freshSource };
  const load = await cacheFirstLoadWithBackground({
    loadCached: async () => payload, loadFresh: async () => payload, onFresh: () => undefined,
    markStale: value => ({ source: staleCached(value.source), catalogSource: staleCached(value.catalogSource) }),
  });
  await load.background;
  expect(load.value.source).toEqual({ ...freshSource, isStale: true });
  expect(load.value.catalogSource).toEqual({ ...freshSource, isStale: true });
  expect(staleCached({ source: freshSource }, { label: '暂存资料' }).source)
    .toEqual({ ...freshSource, isStale: true, label: '暂存资料' });
});

it.each([
  [{ ...freshSource, kind: 'cache' as const }, true],
  [{ ...freshSource, isStale: true }, true],
  [freshSource, false],
])('按来源与暂存标记识别回退数据', (source, expected) => {
  expect(isCacheFallback({ source })).toBe(expected);
});
