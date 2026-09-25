import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useOverviewSync } from '@/hooks/use-overview-sync';
import { createRizlineBoundAccount } from '@/domain/bound-account';
import { rizlinePayloadFromSnapshot, type GameDataBundle } from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { failedRefresh, successfulRefresh, type RefreshResult } from '@/domain/refresh-result';
import {
  gameDataQueryKey,
  registerGameDataBackground,
  resetGameDataBackground,
} from '@/services/game-data-query';
import { queryClient } from '@/state/query-client';
import { invalidateResourceWrites } from '@/services/snapshot-cache-utils';
import { abortForegroundWork, beginForegroundWork } from '@/state/app-lifecycle-core';
import { ProviderError } from '@/providers/errors';
import type { RizlineSession } from '@/providers/contracts';
import { fixtureSource } from '@/fixtures/sanitized';
import { rizlineCatalog, rizlineSave } from './fixtures/rizline';

const mockNotification = jest.fn();
const mockCatalog = jest.fn<() => Promise<void>>();
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotification }) }));
jest.mock('@/hooks/use-rizline-catalog', () => ({ refreshRizlineCatalog: () => mockCatalog() }));

type Params = Parameters<typeof useOverviewSync>[0];
const account = createRizlineBoundAccount(rizlineSave());
const session: RizlineSession = { mode: 'rizline', token: 'test-token', phone: '13800138000', deviceId: 'device', channelId: '1', persistable: true };
const key = gameDataQueryKey(account.id, 'rizline', 'rizline-official', 'rizline');
function bundle({ stale = false, requiresLogin = false } = {}): GameDataBundle {
  return { gameId: 'rizline', providerId: 'rizline-official', profile: getGameProfile('rizline'),
    payload: rizlinePayloadFromSnapshot({ save: rizlineSave(), source: { ...fixtureSource, isStale: stale }, requiresLogin },
      { snapshot: rizlineCatalog(), source: fixtureSource }) };
}
function settledBundle(): RefreshResult<GameDataBundle, 'data' | 'catalog'> {
  return successfulRefresh({
    value: bundle(),
    metadata: { provider: 'rizline-official', label: '官方账号', fetchedAt: fixtureSource.updatedAt, revision: null },
    requested: ['data'],
  });
}
function options(refetch: () => Promise<unknown>, overrides: Partial<Params> = {}): Params {
  return { boundAccounts: [account], activeAccountId: account.id, activeGameId: 'rizline', activeSession: session,
    catalogQuery: { refetch: jest.fn() } as unknown as Params['catalogQuery'],
    gameQuery: { refetch, profile: getGameProfile('rizline') } as unknown as Params['gameQuery'],
    operation: { begin: jest.fn(() => true), finish: jest.fn() }, ...overrides };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks(); queryClient.clear(); beginForegroundWork(); resetGameDataBackground();
  mockCatalog.mockResolvedValue(undefined);
});
afterEach(async () => { await cleanup(); queryClient.clear(); beginForegroundWork(); resetGameDataBackground(); });

it('still synchronizes scores when catalog refresh fails and reports partial failure', async () => {
  mockCatalog.mockRejectedValue(new Error('catalog offline'));
  const refetch = jest.fn(async () => ({ data: bundle(), isError: false }));
  const hook = await renderHook(() => useOverviewSync(options(refetch)));
  let result: boolean | undefined;
  await act(async () => { result = await hook.result.current.syncData(); });
  expect(refetch).toHaveBeenCalledTimes(1); expect(result).toBe(false);
  expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '成绩已同步，曲库暂未更新', variant: 'warning' }));
});

it('waits for the entity background refresh handle and decides from its terminal result', async () => {
  const pending = deferred<ReturnType<typeof settledBundle>>();
  registerGameDataBackground(key, pending.promise);
  const refetch = jest.fn(async () => ({ data: bundle({ stale: true }), isError: false }));
  const hook = await renderHook(() => useOverviewSync(options(refetch)));
  let result: boolean | undefined, syncing!: Promise<void>;
  await act(() => { syncing = hook.result.current.syncData().then(value => { result = value; }); });
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(result).toBeUndefined();
  await act(async () => { pending.resolve(settledBundle()); await syncing; });
  expect(result).toBe(true); expect(mockNotification).not.toHaveBeenCalled();
});

it('treats a terminal background result that only kept the cache as a failure', async () => {
  const pending = deferred<ReturnType<typeof settledBundle>>();
  registerGameDataBackground(key, pending.promise);
  const refetch = jest.fn(async () => ({ data: bundle(), isError: false }));
  const hook = await renderHook(() => useOverviewSync(options(refetch)));
  let result: boolean | undefined, syncing!: Promise<void>;
  await act(() => { syncing = hook.result.current.syncData().then(value => { result = value; }); });
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  await act(async () => {
    pending.resolve(failedRefresh({
      value: bundle({ stale: true }), metadata: null, requested: ['data'],
      failures: [{ code: 'no_data', target: 'data', diagnostic: '仅读取到缓存', retryable: true }],
    }));
    await syncing;
  });
  expect(result).toBe(false);
  expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '同步失败', variant: 'error' }));
});

it.each([
  ['network fallback', { data: bundle({ stale: true }), isError: false }],
  ['expired token', { data: bundle({ stale: true, requiresLogin: true }), isError: false }],
  ['failed refetch retaining old fresh data', { data: bundle(), isError: true, error: new ProviderError('network', 'offline', false) }],
])('does not treat %s as a successful sync', async (_label, response) => {
  const hook = await renderHook(() => useOverviewSync(options(jest.fn(async () => response))));
  let result: boolean | undefined;
  await act(async () => { result = await hook.result.current.syncData(); });
  expect(result).toBe(false); expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '同步失败', variant: 'error' }));
});

it.each(['account switch', 'account rebind', 'cache clear', 'background', 'unmount'] as const)('suppresses late sync completion after %s', async mode => {
  const pending = deferred<void>(); mockCatalog.mockReturnValue(pending.promise);
  const refetch = jest.fn(async () => ({ data: bundle(), isError: false }));
  const props = options(refetch);
  const hook = await renderHook((value: Params) => useOverviewSync(value), { initialProps: props });
  let result: boolean | undefined, syncing!: Promise<void>;
  await act(() => { syncing = hook.result.current.syncData().then(value => { result = value; }); });
  await waitFor(() => expect(mockCatalog).toHaveBeenCalled());
  if (mode === 'account switch') await hook.rerender({ ...props, activeAccountId: 'rizline:official:user-b' });
  else if (mode === 'account rebind') invalidateResourceWrites(`account:${account.id}`);
  else if (mode === 'cache clear') invalidateResourceWrites('rizline');
  else if (mode === 'background') abortForegroundWork();
  else await hook.unmount();
  await act(async () => { pending.resolve(); await syncing; });
  expect(result).toBe(false); expect(refetch).not.toHaveBeenCalled(); expect(mockNotification).not.toHaveBeenCalled();
  expect(props.operation.finish).toHaveBeenCalledTimes(1);
});

it('cancels the selected account without cancelling another account query', async () => {
  const cancel = jest.spyOn(queryClient, 'cancelQueries');
  const hook = await renderHook(() => useOverviewSync(options(jest.fn(async () => ({ data: bundle(), isError: false })))));
  await act(async () => { await hook.result.current.syncData(); });
  const predicate = cancel.mock.calls[0][0]?.predicate;
  expect(predicate).toBeDefined();
  const selected = queryClient.getQueryCache().build(queryClient, { queryKey: key });
  const other = queryClient.getQueryCache().build(queryClient, { queryKey: gameDataQueryKey('rizline:official:user-b', 'rizline', 'rizline-official', 'rizline') });
  expect(predicate?.(selected)).toBe(true); expect(predicate?.(other)).toBe(false); cancel.mockRestore();
});
