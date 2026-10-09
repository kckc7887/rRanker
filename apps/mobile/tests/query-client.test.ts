import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver, focusManager, type QueryFunctionContext, type QueryObserverOptions } from '@tanstack/react-query';
import { queryClient, resumeInterruptedActiveQueries } from '@/state/query-client';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';

const clients: QueryClient[] = [];
const observers: (() => void)[] = [];

function client() {
  const value = new QueryClient({ defaultOptions: { queries: {
    retry: 1, staleTime: 300_000, gcTime: Infinity, refetchOnWindowFocus: false,
  } } });
  value.mount();
  clients.push(value);
  return value;
}

function observe(
  value: QueryClient,
  key: string,
  queryFn: (context: QueryFunctionContext) => Promise<number>,
  options: Partial<QueryObserverOptions<number>> = {},
) {
  const observer = new QueryObserver<number>(value, { queryKey: [key], queryFn, ...options });
  const unsubscribe = observer.subscribe(() => undefined);
  observers.push(unsubscribe);
  return { observer, unsubscribe };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const flush = () => new Promise<void>(done => { setImmediate(done); });

beforeEach(() => { focusManager.setFocused(true); });
afterEach(() => {
  for (const unsubscribe of observers.splice(0)) unsubscribe();
  for (const value of clients.splice(0)) { value.unmount(); value.clear(); }
  queryClient.clear();
  vi.unstubAllGlobals();
  focusManager.setFocused(undefined);
});

describe('query failure retry', () => {
  function playerQuery(refreshToken: string) {
    const provider = new LxnsScoreProvider({ mode: 'lxns-oauth', accessToken: 'expired-access', refreshToken,
      expiresAt: 0, persistable: true });
    return queryClient.fetchQuery({ queryKey: ['player', refreshToken], retryDelay: 0,
      queryFn: ({ signal }) => provider.getPlayer(signal) });
  }

  it('stops after the server rejects the refresh token', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(playerQuery('rejected-refresh')).rejects.toMatchObject({ code: 'authentication', retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('recovers from a temporary token service failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"server_error"}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'fresh-access', refresh_token: 'fresh-refresh', expires_in: 900 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, code: 200,
        data: { name: '玩家', rating: 15000, friend_code: 123 } })));
    vi.stubGlobal('fetch', fetcher);

    await expect(playerQuery('temporary-failure')).resolves.toMatchObject({ displayName: '玩家', rating: 15000 });
  });

  it('stops after one retry when the token service remains unavailable', async () => {
    const fetcher = vi.fn(async () => new Response('{"error":"server_error"}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);

    await expect(playerQuery('unavailable-refresh')).rejects.toMatchObject({ code: 'network', retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('active first query recovery', () => {
  it('resumes a cancelled first fetch that focus alone leaves pending and idle, only once', async () => {
    const value = client();
    const resumed = deferred<number>();
    let calls = 0;
    let aborts = 0;
    const { observer } = observe(value, 'interrupted', ({ signal }) => {
      calls += 1;
      signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
      return calls === 1 ? new Promise((_done, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('cancelled')); }, { once: true });
      }) : resumed.promise;
    });
    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    focusManager.setFocused(false);
    await value.cancelQueries();
    expect(observer.getCurrentResult()).toMatchObject({ status: 'pending', fetchStatus: 'idle', isError: false });
    focusManager.setFocused(true);
    await flush();
    expect(calls).toBe(1);
    const firstRecovery = resumeInterruptedActiveQueries(value);
    const repeatedRecovery = resumeInterruptedActiveQueries(value);
    expect(calls).toBe(2);
    expect(aborts).toBe(1);
    resumed.resolve(7);
    await Promise.all([firstRecovery, repeatedRecovery]);
    expect(observer.getCurrentResult()).toMatchObject({ status: 'success', fetchStatus: 'idle', data: 7 });
    await resumeInterruptedActiveQueries(value);
    expect(calls).toBe(2);
  });

  it('does not start inactive or disabled pending queries or recreate a removed query', async () => {
    const value = client();
    let calls = 0;
    const read = async () => { calls += 1; return 1; };
    value.getQueryCache().build(value, { queryKey: ['inactive'], queryFn: read });
    const disabled = observe(value, 'disabled', read, { enabled: false });
    value.getQueryCache().build(value, { queryKey: ['removed'], queryFn: read });
    value.removeQueries({ queryKey: ['removed'] });
    await resumeInterruptedActiveQueries(value);
    expect(calls).toBe(0);
    expect(value.getQueryState(['inactive'])).toMatchObject({ status: 'pending', fetchStatus: 'idle' });
    expect(disabled.observer.getCurrentResult()).toMatchObject({ status: 'pending', fetchStatus: 'idle' });
    expect(value.getQueryState(['removed'])).toBeUndefined();
  });

  it('preserves both fresh and stale cached values and terminal errors', async () => {
    const value = client();
    let cachedCalls = 0;
    const read = async () => { cachedCalls += 1; return 9; };
    observe(value, 'fresh', read, { initialData: 1 });
    observe(value, 'stale', read, { initialData: 2, staleTime: 0, refetchOnMount: false });
    let failedCalls = 0;
    const failed = observe(value, 'failed', async () => { failedCalls += 1; throw new Error('unavailable'); }, { retry: false });
    await flush();
    expect(failed.observer.getCurrentResult().status).toBe('error');
    await resumeInterruptedActiveQueries(value);
    expect(cachedCalls).toBe(0);
    expect(failedCalls).toBe(1);
    expect(value.getQueryData(['fresh'])).toBe(1);
    expect(value.getQueryData(['stale'])).toBe(2);
    expect(failed.observer.getCurrentResult()).toMatchObject({ status: 'error', fetchStatus: 'idle' });
  });

  it('leaves a newer active fetch running without abort or replacement', async () => {
    const value = client();
    const pending = deferred<number>();
    let calls = 0;
    let aborts = 0;
    const { observer } = observe(value, 'newer-request', ({ signal }) => {
      calls += 1;
      signal.addEventListener('abort', () => { aborts += 1; }, { once: true });
      return calls === 1 ? new Promise((_done, reject) => {
        signal.addEventListener('abort', () => { reject(new Error('cancelled')); }, { once: true });
      }) : pending.promise;
    });
    await value.cancelQueries();
    const newerFetch = observer.refetch();
    await resumeInterruptedActiveQueries(value);
    expect(calls).toBe(2);
    expect(aborts).toBe(1);
    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    pending.resolve(5);
    await newerFetch;
    expect(observer.getCurrentResult()).toMatchObject({ status: 'success', data: 5 });
  });
});
