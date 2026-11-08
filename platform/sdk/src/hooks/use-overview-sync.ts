import { useCallback, useEffect, useRef, useState } from 'react';
import { getDataSource, getGameAdapter, getGameResourceSource } from '@rranker/sdk/registry';
import type { GameDataRefreshResult, GameDataRefreshTarget } from '@rranker/sdk/data-load';
import type { RefreshFailure } from '@rranker/sdk/domain/refresh-result';
import { useNotification, type NotificationInput } from '@rranker/sdk/components/AppNotification';
import { ProviderError, providerErrorToUserMessage } from '@rranker/sdk/providers/errors';
import { queryClient } from '@rranker/sdk/state/query-client';
import { useSession } from '@rranker/sdk/state/session-store';
import { resolveAccountClient } from '@rranker/sdk/state/session-provider-resolver';
import { refreshGameDataBundle } from '@rranker/sdk/services/game-data-query';
import { invalidateResourceWrites, resourceWriteGeneration, subscribeResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { getForegroundAbortSignal } from '@rranker/sdk/state/app-lifecycle-core';
import type { useGameData } from '@rranker/sdk/hooks/use-game-data';
import type { useOverviewOperation } from '@rranker/sdk/hooks/use-overview-operation';

type SyncNotifier = (input: NotificationInput) => void;

function failureAsError(failure: RefreshFailure<GameDataRefreshTarget>): unknown {
  return failure.code === 'no_data' ? new Error(failure.diagnostic)
    : new ProviderError(failure.code, failure.diagnostic, failure.retryable);
}

function reportRefreshResult(gameId: string, providerId: string | null, result: GameDataRefreshResult, notify: SyncNotifier): boolean {
  if (result.status === 'cancelled') return false;
  if (result.status === 'success' || result.status === 'noop') return true;
  if (result.status === 'partial') {
    const labels: Record<GameDataRefreshTarget, string> = { data: '成绩', catalog: '曲库', player: '玩家资料', scores: '成绩列表', bests: '最佳成绩' };
    const failed = [...new Set(result.failures.map(failure => labels[failure.target ?? 'data']))].join('、');
    const needsLogin = result.failures.some(failure => failure.code === 'authentication');
    notify({ title: '部分数据未同步', message: `${failed || '部分数据'}未更新；${needsLogin ? '请重新登录后重试。' : '已保留可用数据，请稍后重试。'}`, variant: 'warning' });
    return false;
  }
  const notice = providerId ? getDataSource(providerId)?.syncFailureNotice?.(gameId, result) : undefined;
  if (notice) { notify(notice); return false; }
  const failure = result.failures.find(item => item.code === 'authentication')
    ?? result.failures.find(item => item.target === 'data') ?? result.failures[0];
  if (failure?.code === 'authentication') {
    notify({ title: '同步失败', message: providerErrorToUserMessage(failureAsError(failure), '暂时无法同步成绩，请稍后重试。'), variant: 'error' });
  } else if (failure?.code !== 'no_data') {
    notify({ title: '刷新失败', message: '当前仍显示缓存，请稍后重试。', variant: 'warning' });
  } else {
    notify({ title: '同步失败', message: '暂时无法同步成绩，请稍后重试。', variant: 'error' });
  }
  return false;
}

export function useOverviewSync({ gameQuery, operation }: {
  gameQuery: ReturnType<typeof useGameData>;
  operation: ReturnType<typeof useOverviewOperation>['operation'];
}) {
  const { showNotification } = useNotification();
  const { activeAccountId, activeGameId, refetch } = gameQuery;
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const activeScope = useRef({ activeAccountId, activeGameId });
  activeScope.current = { activeAccountId, activeGameId };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const syncData = useCallback(async (): Promise<boolean> => {
    if (!operation.begin()) return false;
    setRefreshing(true);
    const foreground = getForegroundAbortSignal();
    const controller = new AbortController();
    request.current = controller;
    const signal = controller.signal;
    const cancel = () => controller.abort(foreground.reason ?? new Error('同步请求已失效'));
    foreground.addEventListener('abort', cancel, { once: true });
    if (foreground.aborted) cancel();
    const gameGeneration = resourceWriteGeneration(activeGameId);
    invalidateResourceWrites(`account:${activeAccountId}`);
    const accountGeneration = resourceWriteGeneration(`account:${activeAccountId}`);
    const initial = useSession.getState().boundAccounts.find(account => account.id === activeAccountId);
    const sourceId = initial?.providerId ? getDataSource(initial.providerId)?.id : undefined;
    const resourceSourceId = getGameResourceSource(activeGameId)?.id;
    const scopes = new Set([activeGameId, `account:${activeAccountId}`, ...(sourceId ? [sourceId] : []), ...(resourceSourceId ? [resourceSourceId] : [])]);
    const subscriptions = [...scopes].map(scope => subscribeResourceWrites(scope, cancel));
    const unsubscribeSession = useSession.subscribe(state => { if (state.activeAccountId !== activeAccountId) cancel(); });
    const isCurrent = () => mounted.current && !signal.aborted
      && activeScope.current.activeAccountId === activeAccountId && activeScope.current.activeGameId === activeGameId
      && useSession.getState().activeAccountId === activeAccountId
      && resourceWriteGeneration(activeGameId) === gameGeneration
      && resourceWriteGeneration(`account:${activeAccountId}`) === accountGeneration;
    const assertCurrent = () => { if (!isCurrent()) throw new Error('同步请求已失效'); };
    try {
      await queryClient.cancelQueries({ predicate: query => query.meta?.accountId === activeAccountId || query.queryKey.includes(activeAccountId) });
      assertCurrent();
      const state = useSession.getState();
      const account = state.boundAccounts.find(item => item.id === activeAccountId);
      if (!account) return false;
      const source = account.providerId ? getDataSource(account.providerId) : undefined;
      await source?.sync?.({ account, credential: state.sessionsByAccountId[activeAccountId] ?? null,
        client: resolveAccountClient(activeAccountId), queryClient, signal, assertCurrent });
      assertCurrent();
      const resources = await getGameAdapter(activeGameId)?.refreshResources?.({ queryClient, signal });
      assertCurrent();
      await queryClient.invalidateQueries({ predicate: query => query.meta?.accountId === activeAccountId || query.queryKey.includes(activeAccountId), refetchType: 'none' });
      assertCurrent();
      const result = await refreshGameDataBundle({ client: queryClient,
        params: { accountId: activeAccountId, gameId: activeGameId, providerId: account.providerId, mode: state.sessionsByAccountId[activeAccountId]?.mode ?? null },
        refetch: () => refetch(), catalogFailed: resources?.catalogFailed });
      assertCurrent();
      return reportRefreshResult(activeGameId, account.providerId, result, showNotification);
    } catch (error) {
      if (isCurrent()) showNotification({ title: '同步失败', message: providerErrorToUserMessage(error, '暂时无法同步成绩，请稍后重试。'), variant: 'error' });
      return false;
    } finally {
      foreground.removeEventListener('abort', cancel);
      unsubscribeSession();
      for (const unsubscribe of subscriptions) unsubscribe();
      if (request.current === controller) request.current = null;
      operation.finish();
      if (mounted.current) setRefreshing(false);
    }
  }, [activeAccountId, activeGameId, refetch, showNotification, operation]);
  return { syncData, refreshing };
}
