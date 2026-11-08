import type { RizlineSession } from '@rranker/provider-rizline-official/credential';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useOverviewSync } from '@rranker/sdk/hooks/use-overview-sync';
import { createRizlineBoundAccount } from '@rranker/game-rizline/accounts';
import { rizlinePayloadFromSnapshot } from '@rranker/game-rizline/domain/game-data';
import { type GameDataBundle } from '@rranker/sdk/data';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { failedRefresh, successfulRefresh, type RefreshResult } from '@rranker/sdk/domain/refresh-result';
import {
  gameDataQueryKey,
  registerGameDataBackground,
} from '@rranker/sdk/services/game-data-query';
import { queryClient } from '@rranker/sdk/state/query-client';
import { invalidateResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { abortForegroundWork, beginForegroundWork } from '@rranker/sdk/state/app-lifecycle-core';
import { ProviderError } from '@rranker/sdk/providers/errors';

import { createMaimaiBoundAccount } from '@rranker/game-maimai/accounts';
import { MAIMAI_CATALOG_QUERY_KEY } from '@rranker/game-maimai/services/maimai-catalog-query';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { applyDisabledPlugins } from '@rranker/sdk/services/plugin-lifecycle';
import { setDisabledPlugins } from '@rranker/sdk/registry';
import { fixtureSource, fixtureCatalog } from './fixtures/sanitized';
import { rizlineCatalog, rizlineSave } from './fixtures/rizline';

const mockNotification = jest.fn();
const mockCatalog = jest.fn<() => Promise<void>>();
jest.mock('@rranker/sdk/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotification }) }));
jest.mock('@rranker/game-rizline/services/rizline-catalog-query', () => ({ refreshRizlineCatalog: () => mockCatalog() }));

type Params = Parameters<typeof useOverviewSync>[0];
const initial = useAccountStore.getState();
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
  return { gameQuery: { refetch, profile: getGameProfile('rizline'), activeAccountId: account.id, activeGameId: 'rizline' } as unknown as Params['gameQuery'],
    operation: { begin: jest.fn(() => true), finish: jest.fn() }, ...overrides };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks(); queryClient.clear(); beginForegroundWork(); registerGameDataBackground(key, undefined);
  setDisabledPlugins([]); useAccountStore.setState(initial, true);
  useAccountStore.getState().bindAccounts({ accounts: [account], session, credentialId: 'rizline', activeAccountId: account.id });
  mockCatalog.mockResolvedValue(undefined);
});
afterEach(async () => { await cleanup(); setDisabledPlugins([]); useAccountStore.setState(initial, true); jest.restoreAllMocks(); queryClient.clear(); beginForegroundWork(); registerGameDataBackground(key, undefined); });

it('still synchronizes scores when catalog refresh fails and reports partial failure', async () => {
  mockCatalog.mockRejectedValue(new Error('catalog offline'));
  const refetch = jest.fn(async () => ({ data: bundle(), isError: false }));
  const hook = await renderHook(() => useOverviewSync(options(refetch)));
  let result: boolean | undefined;
  await act(async () => { result = await hook.result.current.syncData(); });
  expect(refetch).toHaveBeenCalledTimes(1); expect(result).toBe(false);
  expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '部分数据未同步', message: '曲库未更新；已保留可用数据，请稍后重试。', variant: 'warning' }));
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
  ['network fallback', { data: bundle({ stale: true }), isError: false }, { title: '同步失败', variant: 'error' }],
  ['expired token', { data: bundle({ stale: true, requiresLogin: true }), isError: false }, { title: '同步失败', variant: 'error' }],
  ['failed refetch retaining old fresh data', { data: bundle(), isError: true, error: new ProviderError('network', 'offline', false) }, { title: '刷新失败', variant: 'warning' }],
])('does not treat %s as a successful sync', async (_label, response, notice) => {
  const hook = await renderHook(() => useOverviewSync(options(jest.fn(async () => response))));
  let result: boolean | undefined;
  await act(async () => { result = await hook.result.current.syncData(); });
  expect(result).toBe(false); expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining(notice));
});

it.each(['account switch', 'account rebind', 'cache clear', 'background', 'unmount'] as const)('suppresses late sync completion after %s', async mode => {
  const pending = deferred<void>(); mockCatalog.mockReturnValue(pending.promise);
  const refetch = jest.fn(async () => ({ data: bundle(), isError: false }));
  const props = options(refetch);
  const hook = await renderHook((value: Params) => useOverviewSync(value), { initialProps: props });
  let result: boolean | undefined, syncing!: Promise<void>;
  await act(() => { syncing = hook.result.current.syncData().then(value => { result = value; }); });
  await waitFor(() => expect(mockCatalog).toHaveBeenCalled());
  if (mode === 'account switch') {
    const other = { ...account, id: 'rizline:official:user-b' };
    await act(() => { useAccountStore.getState().upsertBoundAccount(other); useAccountStore.getState().selectBoundAccount(other.id); });
    await hook.rerender({ ...props, gameQuery: { ...props.gameQuery, activeAccountId: other.id } });
  }
  else if (mode === 'account rebind') invalidateResourceWrites(`account:${account.id}`);
  else if (mode === 'cache clear') invalidateResourceWrites('rizline');
  else if (mode === 'background') abortForegroundWork();
  else await hook.unmount();
  await act(async () => { pending.resolve(); await syncing; });
  expect(result).toBe(false); expect(refetch).not.toHaveBeenCalled(); expect(mockNotification).not.toHaveBeenCalled();
  expect(props.operation.finish).toHaveBeenCalledTimes(1);
});

it('cancels the selected account without cancelling another account query', async () => {
  let selectedSignal!: AbortSignal;
  let otherSignal!: AbortSignal;
  const otherResponse = deferred<string>();
  const selected = queryClient.fetchQuery({ queryKey: key, meta: { accountId: account.id },
    queryFn: ({ signal }) => { selectedSignal = signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))); } }).catch(() => undefined);
  const otherKey = gameDataQueryKey('rizline:official:user-b', 'rizline', 'rizline-official', 'rizline');
  const other = queryClient.fetchQuery({ queryKey: otherKey, meta: { accountId: 'rizline:official:user-b' },
    queryFn: ({ signal }) => { otherSignal = signal; return otherResponse.promise; } });
  const hook = await renderHook(() => useOverviewSync(options(jest.fn(async () => ({ data: bundle(), isError: false })))));
  await act(async () => { await hook.result.current.syncData(); });
  await selected;
  expect(selectedSignal.aborted).toBe(true);
  expect(otherSignal.aborted).toBe(false);
  otherResponse.resolve('other account'); await other;
  expect(queryClient.getQueryData(otherKey)).toBe('other account');
});

it.each(['停用来源', '切换账号', '退出页面'] as const)('%s 立即取消水鱼同步的 HTTP 请求', async action => {
  const maimai = createMaimaiBoundAccount({ providerId: 'diving-fish', displayName: '水鱼玩家', rating: 0, playerId: 'sync-player' });
  useAccountStore.getState().bindAccounts({ accounts: [maimai], credentialId: 'diving-fish',
    session: { mode: 'import-token', value: 'sync-token', persistable: true }, activeAccountId: maimai.id });
  queryClient.setQueryData(MAIMAI_CATALOG_QUERY_KEY, fixtureCatalog);
  let requestSignal: AbortSignal | undefined;
  jest.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise<Response>((_, reject) => {
    requestSignal = init!.signal!;
    requestSignal.addEventListener('abort', () => reject(requestSignal!.reason), { once: true });
  }));
  const refetch = jest.fn(async () => ({ data: undefined, isError: false }));
  const params = options(refetch);
  params.gameQuery = { ...params.gameQuery, activeAccountId: maimai.id, activeGameId: 'maimai', profile: getGameProfile('maimai') };
  const hook = await renderHook(() => useOverviewSync(params));
  let syncing!: Promise<boolean>;
  await act(() => { syncing = hook.result.current.syncData(); });
  await waitFor(() => expect(requestSignal).toBeDefined());
  if (action === '停用来源') await act(async () => { await applyDisabledPlugins(['provider.diving-fish']); });
  else if (action === '切换账号') await act(() => useAccountStore.getState().selectBoundAccount(account.id));
  else await hook.unmount();
  expect(requestSignal!.aborted).toBe(true);
  let success: boolean | undefined;
  await act(async () => { success = await syncing; });
  expect(success).toBe(false);
  expect(refetch).not.toHaveBeenCalled();
  expect(mockNotification).not.toHaveBeenCalled();
});
