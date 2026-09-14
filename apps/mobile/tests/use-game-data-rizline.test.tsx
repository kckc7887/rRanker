import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useGameData } from '@/hooks/use-game-data';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { createRizlineBoundAccount } from '@/domain/bound-account';
import type { RizlineCatalogData, RizlineSnapshot } from '@/domain/rizline';
import type { GameDataBundle } from '@/domain/game-data';
import type { RizlineSession } from '@/providers/contracts';
import { gameDataQueryKey } from '@/services/game-data-query';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { fixtureSource } from '@/fixtures/sanitized';
import { rizlineCatalog, rizlineSave } from './fixtures/rizline';

const mockCached = jest.fn<(id: string) => Promise<RizlineSnapshot | null>>();
const mockFresh = jest.fn<(id: string, session: RizlineSession, signal: AbortSignal) => Promise<RizlineSnapshot>>();
const mockCatalog = jest.fn<() => Promise<RizlineCatalogData>>();
jest.mock('@/services/rizline-service', () => ({
  loadRizlineCached: (...args: [string]) => mockCached(...args),
  loadRizlineWithFallback: (...args: [string, RizlineSession, AbortSignal]) => mockFresh(...args),
}));
jest.mock('@/hooks/use-rizline-catalog', () => ({
  RIZLINE_CATALOG_QUERY_KEY: ['rizline-catalog'], ensureRizlineCatalog: () => mockCatalog(),
}));

const session: RizlineSession = { mode: 'rizline', token: 'test-token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true };
const initial = useSession.getState();
const account = createRizlineBoundAccount(rizlineSave());
const snapshot = (): RizlineSnapshot => ({ save: rizlineSave(), source: fixtureSource });
const catalog = (): RizlineCatalogData => ({ snapshot: rizlineCatalog(), source: fixtureSource });
const key = gameDataQueryKey(account.id, 'rizline', 'rizline-official', 'rizline');
function wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks(); queryClient.clear(); queryClient.setDefaultOptions({ queries: { retry: false } });
  invalidateResourceWrites('rizline');
  useSession.setState({ ...initial, boundAccounts: [account], activeAccountId: account.id,
    activeGameId: 'rizline', activeProviderId: 'rizline-official', session });
  mockCached.mockResolvedValue(snapshot()); mockFresh.mockResolvedValue(snapshot()); mockCatalog.mockResolvedValue(catalog());
});
afterEach(async () => { await cleanup(); queryClient.clear(); useSession.setState(initial, true); });

it('renders cached scores immediately and publishes an expired-login fallback without losing those scores', async () => {
  const fresh = deferred<RizlineSnapshot>(); mockFresh.mockReturnValue(fresh.promise);
  const hook = await renderHook(() => useGameData(), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.payload).toMatchObject({ kind: 'rizline', player: { username: 'Player A' }, source: { isStale: true } }));
  expect(hook.result.current.data?.payload).not.toMatchObject({ requiresLogin: true });
  await act(() => { fresh.resolve({ ...snapshot(), source: { ...fixtureSource, kind: 'cache', isStale: true }, requiresLogin: true }); });
  await waitFor(() => expect(hook.result.current.data?.payload).toMatchObject({ requiresLogin: true, playerScore: { value: 99.1234 } }));
  expect(useSession.getState().session).toBe(session);
});

it('uses a newer catalog that arrives while official score loading is pending', async () => {
  mockCached.mockResolvedValue(null);
  const fresh = deferred<RizlineSnapshot>(); mockFresh.mockReturnValue(fresh.promise);
  const hook = await renderHook(() => useGameData(), { wrapper });
  await waitFor(() => expect(mockFresh).toHaveBeenCalledTimes(1));
  const latest = catalog(); latest.snapshot.songs[0].title = 'New catalog title';
  await act(() => { queryClient.setQueryData(['rizline-catalog'], latest); fresh.resolve(snapshot()); });
  await waitFor(() => expect(hook.result.current.data?.payload).toMatchObject({ kind: 'rizline', records: [expect.objectContaining({ title: 'New catalog title' })] }));
});

it('keeps cached scores when secure credentials are missing and requests another login', async () => {
  useSession.setState({ session: null });
  const hook = await renderHook(() => useGameData(), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.payload).toMatchObject({ kind: 'rizline', requiresLogin: true, source: { isStale: true } }));
  expect(mockFresh).not.toHaveBeenCalled();
});

it('does not publish a late refresh after the same account was rebound', async () => {
  const fresh = deferred<RizlineSnapshot>(); mockFresh.mockReturnValue(fresh.promise);
  const hook = await renderHook(() => useGameData(), { wrapper });
  await waitFor(() => expect(hook.result.current.data?.payload).toMatchObject({ source: { isStale: true } }));
  invalidateResourceWrites(`account:${account.id}`);
  const current = queryClient.getQueryData<GameDataBundle>(key)!;
  await act(() => {
    queryClient.setQueryData(key, { ...current, payload: { ...current.payload, playerScore: { value: 200, display: '200.0000' } } });
    fresh.resolve({ save: rizlineSave({ totalRks: 1 }), source: fixtureSource });
  });
  expect(queryClient.getQueryData<GameDataBundle>(key)?.payload).toMatchObject({ playerScore: { value: 200 } });
});
