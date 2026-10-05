import { afterEach, vi } from 'vitest';
import { fixtureSource } from '@/fixtures/sanitized';
import { ProviderError } from '@/providers/errors';
import { cacheFirstLoad, cacheFirstLoadWithBackground, isCacheFallback, staleCached } from '@/services/cache-first';
import { installRuntimeLogRecorder } from '@/services/runtime-diagnostics-recorder';
import { loadAliasedCatalog } from '@/services/aliased-catalog-query';

vi.mock('@/state/app-lifecycle-core', () => ({
  getForegroundAbortSignal: () => new AbortController().signal,
}));

type Sample = { value: number; source: typeof fixtureSource };
afterEach(() => installRuntimeLogRecorder(undefined));

it('starts independent catalog and alias reads together while keeping alias failure optional', async () => {
  let finishCatalog!: (value: Sample) => void;
  const catalog = new Promise<Sample>(resolve => { finishCatalog = resolve; });
  const loadCatalog = vi.fn(() => catalog);
  const loadAliases = vi.fn(async (): Promise<Sample> => { throw new Error('aliases unavailable'); });
  const mergeAliases = vi.fn((value: Sample, aliases: Sample | undefined) => ({ ...value, value: value.value + (aliases?.value ?? 0) }));
  const pending = loadAliasedCatalog({
    queryKey: ['catalog-test'], loadCached: async () => null, loadCatalog, loadAliases, mergeAliases,
    composeSource: value => value.source, onFresh: vi.fn(),
  });
  await vi.waitFor(() => expect(loadAliases).toHaveBeenCalledTimes(1));
  expect(loadCatalog).toHaveBeenCalledTimes(1);
  finishCatalog({ value: 42, source: fixtureSource });
  expect((await pending).value).toBe(42);
  expect(mergeAliases).toHaveBeenCalledWith({ value: 42, source: fixtureSource }, undefined);
});

function makeSample(value: number, source = fixtureSource): Sample {
  return { value, source };
}

describe('cacheFirstLoad', () => {
  it('records cache hits and publication stages under one parent operation without copying data', async () => {
    const log = vi.fn(); installRuntimeLogRecorder(log);
    const load = await cacheFirstLoadWithBackground({
      loadCached: async () => makeSample(1), loadFresh: async () => makeSample(2), onFresh: vi.fn(),
      diagnosticParentOperationId: 41,
    });
    expect((await load.background).status).toBe('success');
    const fields = log.mock.calls.map(call => call[1]);
    expect(fields.map(field => field.phase)).toEqual(['cache-read', 'cache-read-complete', 'refresh', 'refresh-complete', 'cache-publish', 'cache-publish-complete', 'settled']);
    expect(fields[1]).toMatchObject({ cacheCount: 1, result: 'hit' });
    expect(fields.every(field => field.parentOperationId === 41)).toBe(true);
    expect(new Set(fields.map(field => field.operationId)).size).toBe(1);
    expect(fields.at(-1)).toMatchObject({ result: 'success' });
    expect(JSON.stringify(fields)).not.toContain(fixtureSource.label);
  });
  it('serves the stale-marked cache first and refreshes in background', async () => {
    const cached = makeSample(1);
    const fresh = makeSample(2);
    let notifyFresh: ((value: Sample) => void) | null = null;
    const freshNotified = new Promise<Sample>((resolve) => { notifyFresh = resolve; });

    const result = await cacheFirstLoad({
      loadCached: async () => cached,
      loadFresh: async () => fresh,
      onFresh: (value) => notifyFresh?.(value),
    });

    expect(result.value).toBe(1);
    expect(result.source.kind).toBe(fixtureSource.kind);
    expect(result.source.isStale).toBe(true);
    expect(result.source.label).toBe(fixtureSource.label);
    const refreshed = await freshNotified;
    expect(refreshed.value).toBe(2);
    expect(refreshed.source.kind).not.toBe('cache');
  });

  it('does not rewrite the query when the background refresh fails', async () => {
    let onFreshCalled = false;
    const result = await cacheFirstLoad({
      loadCached: async () => makeSample(1),
      loadFresh: async () => { throw new Error('network'); },
      onFresh: () => { onFreshCalled = true; },
    });

    expect(result.value).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onFreshCalled).toBe(false);
  });

  it('does not rewrite the query after the foreground signal is aborted', async () => {
    const controller = new AbortController();
    let resolveFresh!: (value: Sample) => void;
    const fresh = new Promise<Sample>((resolve) => { resolveFresh = resolve; });
    let onFreshCalled = false;

    const result = await cacheFirstLoad({
      loadCached: async () => makeSample(1),
      loadFresh: async () => fresh,
      onFresh: () => { onFreshCalled = true; },
      signal: controller.signal,
    });
    controller.abort();
    resolveFresh(makeSample(2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.value).toBe(1);
    expect(onFreshCalled).toBe(false);
  });

  it('rejects a cache miss whose request finishes after cancellation', async () => {
    const controller = new AbortController();
    let resolveFresh!: (value: Sample) => void;
    const fresh = new Promise<Sample>((resolve) => { resolveFresh = resolve; });
    const pending = cacheFirstLoad({
      loadCached: async () => null,
      loadFresh: async () => fresh,
      onFresh: () => undefined,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    resolveFresh(makeSample(2));

    await expect(pending).rejects.toThrow('cache first load aborted');
  });

  it('does not rewrite the query when the refresh returns a fallback cache', async () => {
    const fallback = makeSample(1, {
      ...fixtureSource,
      kind: 'cache',
      isStale: true,
      label: '兜底缓存',
    });
    let onFreshCalled = false;
    const result = await cacheFirstLoad({
      loadCached: async () => makeSample(0),
      loadFresh: async () => fallback,
      onFresh: () => { onFreshCalled = true; },
    });

    expect(result.value).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onFreshCalled).toBe(false);
  });

  it('loads from the network when no cache exists', async () => {
    let onFreshCalled = false;
    const result = await cacheFirstLoad({
      loadCached: async () => null,
      loadFresh: async () => makeSample(2),
      onFresh: () => { onFreshCalled = true; },
    });

    expect(result.value).toBe(2);
    expect(result.source.kind).not.toBe('cache');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onFreshCalled).toBe(false);
  });

  it('reports fallback status separately and suppresses it after cancellation', async () => {
    for (const cancel of [false, true]) {
      const controller = new AbortController();
      let finish!: (value: Sample) => void;
      const pending = new Promise<Sample>(resolve => { finish = resolve; });
      const onFresh = vi.fn(); const onFallback = vi.fn();
      await cacheFirstLoad({ loadCached: async () => makeSample(1), loadFresh: () => pending,
        signal: controller.signal, onFresh, onFallback });
      if (cancel) controller.abort();
      const fallback = staleCached(makeSample(1)); finish(fallback);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(onFresh).not.toHaveBeenCalled();
      if (cancel) expect(onFallback).not.toHaveBeenCalled();
      else expect(onFallback).toHaveBeenCalledWith(fallback, null);
    }
  });

  it('routes a refresh the service declares as a fallback away from onFresh', async () => {
    const fallback = makeSample(1);
    const onFresh = vi.fn(); const onFallback = vi.fn();
    const result = await cacheFirstLoad({
      loadCached: async () => makeSample(0),
      loadFresh: async () => fallback,
      onFresh,
      onFallback,
      isFallback: (value) => value === fallback,
    });

    expect(result.value).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onFresh).not.toHaveBeenCalled();
    expect(onFallback).toHaveBeenCalledWith(fallback, null);
  });

  it('reports a failed refresh with its machine error code instead of its text', async () => {
    const onFresh = vi.fn(); const onRefreshFailed = vi.fn();
    const result = await cacheFirstLoad({
      loadCached: async () => makeSample(1),
      loadFresh: async () => { throw new ProviderError('authentication', '登录状态已变化', false); },
      onFresh,
      onRefreshFailed,
    });

    expect(result.value).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onFresh).not.toHaveBeenCalled();
    expect(onRefreshFailed).toHaveBeenCalledWith({
      code: 'authentication', target: null, diagnostic: '登录状态已变化', retryable: false,
    });
  });

  it('does not report a failed refresh after the foreground signal is aborted', async () => {
    const controller = new AbortController();
    const onRefreshFailed = vi.fn();
    let reject!: (error: unknown) => void;
    await cacheFirstLoad({
      loadCached: async () => makeSample(1),
      loadFresh: () => new Promise<Sample>((_resolve, fail) => { reject = fail; }),
      onFresh: () => undefined,
      onRefreshFailed,
      signal: controller.signal,
    });
    controller.abort();
    reject(new ProviderError('network', 'offline', true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onRefreshFailed).not.toHaveBeenCalled();
  });

  it('supports a custom stale marker for payloads with multiple sources', async () => {
    const payload = { source: fixtureSource, catalogSource: fixtureSource };
    const markStale = (value: typeof payload) => ({
      ...value,
      source: staleCached(value.source),
      catalogSource: staleCached(value.catalogSource),
    });

    const result = await cacheFirstLoad({
      loadCached: async () => payload,
      loadFresh: async () => payload,
      onFresh: () => undefined,
      markStale,
    });

    expect(result.source.kind).toBe(fixtureSource.kind);
    expect(result.catalogSource.kind).toBe(payload.catalogSource.kind);
    expect(result.catalogSource.isStale).toBe(true);
  });

  it('overrides the source label when requested', () => {
    const marked = staleCached(makeSample(1), { label: '落雪咖啡屋（缓存）' });
    expect(marked.source.label).toBe('落雪咖啡屋（缓存）');
    expect(marked.source.kind).toBe(fixtureSource.kind);
    expect(marked.source.isStale).toBe(true);
  });

  it('keeps already-stale values untouched', () => {
    const already = makeSample(1, { ...fixtureSource, kind: 'cache', isStale: true });
    expect(staleCached(already)).toBe(already);
  });
});

describe('isCacheFallback', () => {
  it('treats cache-kind sources as fallbacks', () => {
    expect(isCacheFallback(makeSample(1, { ...fixtureSource, kind: 'cache', isStale: true }))).toBe(true);
  });

  it('treats stale-flagged sources as fallbacks even when the kind is unchanged', () => {
    expect(isCacheFallback(makeSample(1, { ...fixtureSource, isStale: true }))).toBe(true);
  });

  it('treats live sources as non-fallbacks', () => {
    expect(isCacheFallback(makeSample(1, fixtureSource))).toBe(false);
  });
});
