import { fixtureSource } from '@/fixtures/sanitized';
import { cacheFirstLoad, isCacheFallback, staleCached } from '@/services/cache-first';

type Sample = { value: number; source: typeof fixtureSource };

function makeSample(value: number, source = fixtureSource): Sample {
  return { value, source };
}

describe('cacheFirstLoad', () => {
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
    expect(result.source.kind).toBe('cache');
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

    expect(result.source.kind).toBe('cache');
    expect(result.catalogSource.kind).toBe('cache');
    expect(result.catalogSource.isStale).toBe(true);
  });

  it('overrides the source label when requested', () => {
    const marked = staleCached(makeSample(1), { label: '落雪咖啡屋（缓存）' });
    expect(marked.source.label).toBe('落雪咖啡屋（缓存）');
    expect(marked.source.kind).toBe('cache');
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
