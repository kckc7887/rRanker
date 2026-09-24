import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotification, type NotificationInput } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import { formatPlayerScore, type GamePayload } from '@/domain/game-data';
import type { GameId } from '@/domain/game-bind-options';
import type { ProviderSession } from '@/providers/contracts';
import { ProviderError, providerErrorToUserMessage } from '@/providers/errors';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { refreshDivingFishAccounts } from '@/services/refresh-diving-fish-accounts';
import { refreshPhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { refreshRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { awaitScoreFresh } from '@/services/score-service';
import { awaitChunithmFresh } from '@/services/chunithm-personal-service';
import { readSettledGameDataBundle } from '@/services/game-data-query';
import { awaitRizlineFresh } from '@/services/rizline-service';
import { invalidateResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';
import type { useGameData } from '@/hooks/use-game-data';
import type { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import type { useOverviewOperation } from '@/hooks/use-overview-operation';

type SyncNotifier = (input: NotificationInput) => void;

async function cancelStaleSyncQueries(activeGameId: GameId, activeAccountId: string): Promise<number> {
  if (activeGameId === 'rizline') {
    invalidateResourceWrites(`account:${activeAccountId}`);
    const accountGeneration = resourceWriteGeneration(`account:${activeAccountId}`);
    await queryClient.cancelQueries({ predicate: query => query.queryKey.includes(activeAccountId) });
    return accountGeneration;
  }
  await queryClient.cancelQueries({ queryKey: ['game-data'] });
  return resourceWriteGeneration(`account:${activeAccountId}`);
}

async function refreshDivingFishForSync(input: {
  account: BoundAccount | undefined;
  activeSession: ProviderSession | null;
  catalogData: ReturnType<typeof useDetailedCatalog>['data'];
  catalogError: ReturnType<typeof useDetailedCatalog>['error'];
  refetchCatalog: ReturnType<typeof useDetailedCatalog>['refetch'];
  updateBoundAccountScore: (accountId: string, scoreDisplay: string, displayName?: string) => void;
  ratingDigits: number;
}): Promise<void> {
  const { account, activeSession } = input;
  if (account?.providerId !== 'diving-fish' || activeSession?.mode !== 'import-token') return;
  const catalog = input.catalogData ?? (await input.refetchCatalog()).data;
  if (!catalog) throw input.catalogError ?? new Error('舞萌曲库尚未就绪，请稍后重试');
  const result = await refreshDivingFishAccounts({
    accounts: [account],
    sessionsByAccountId: { [account.id]: activeSession },
    catalog,
  });
  const refreshed = result.refreshed[0];
  if (!refreshed) throw result.failed[0]?.error ?? new Error('水鱼账号同步失败');
  input.updateBoundAccountScore(
    account.id,
    formatPlayerScore(refreshed.snapshot.best50.rating, input.ratingDigits),
    refreshed.snapshot.player.displayName,
  );
}

async function refreshRizlineCatalogBestEffort(): Promise<boolean> {
  try {
    await refreshRizlineCatalog();
    return false;
  } catch {
    return true;
  }
}

const SYNC_FRESH_WAITERS: Partial<Record<GameId, (accountId: string) => Promise<void>>> = {
  maimai: (accountId) => awaitScoreFresh(accountId),
  chunithm: (accountId) => awaitChunithmFresh(accountId),
  rizline: (accountId) => awaitRizlineFresh(accountId),
};

function checkMaimaiLxnsFresh(payload: GamePayload | undefined, notify: SyncNotifier): boolean {
  const isFreshMaimaiData = payload?.kind === 'maimai' && !payload.source.isStale;
  if (isFreshMaimaiData) return true;
  notify({
    title: '尚未读取到新数据',
    message: payload?.kind === 'maimai' && payload.source.isStale
      ? '本次仅读取到缓存，请关闭代理并检查网络后重试。'
      : '请确认微信已完成上传、代理已经关闭，再重试同步。',
    variant: 'warning',
  });
  return false;
}

function checkChunithmFresh(payload: GamePayload | undefined, notify: SyncNotifier): boolean {
  const isFreshChunithmData = payload?.kind === 'chunithm'
    && payload.hasSyncedData
    && !payload.source.isStale;
  if (isFreshChunithmData) return true;
  notify({
    title: '尚未读取到新数据',
    message: payload?.kind === 'chunithm' && payload.source.isStale
      ? '本次仅读取到缓存，请关闭代理并检查网络后重试。'
      : '请确认微信已提示上传完成、代理已经关闭，再重试同步。',
    variant: 'warning',
  });
  return false;
}

function checkMajdataFresh(payload: GamePayload | undefined): void {
  if (payload?.kind !== 'majdata-net' || payload.source.isStale) throw new Error('Majdata refresh failed');
}

function checkRizlineFresh(input: {
  payload: GamePayload | undefined;
  refreshed: { isError: boolean; error: unknown };
  catalogFailed: boolean;
  notify: SyncNotifier;
}): boolean {
  if (input.refreshed.isError) throw input.refreshed.error ?? new Error('Rizline refresh failed');
  if (input.payload?.kind === 'rizline' && input.payload.requiresLogin) throw new ProviderError('authentication', 'Rizline session expired', false);
  if (input.payload?.kind !== 'rizline' || input.payload.source.isStale) throw new Error('Rizline refresh failed');
  if (input.catalogFailed || input.payload.catalogSource?.isStale) {
    input.notify({ title: '成绩已同步，曲库暂未更新', message: '已保存最新成绩；曲库更新失败，请稍后再试。', variant: 'warning' });
    return false;
  }
  return true;
}

export function useOverviewSync({ boundAccounts, activeAccountId, activeGameId, activeSession, catalogQuery, gameQuery, operation }: {
  boundAccounts: BoundAccount[];
  activeAccountId: string;
  activeGameId: GameId;
  activeSession: ProviderSession | null;
  catalogQuery: ReturnType<typeof useDetailedCatalog>;
  gameQuery: ReturnType<typeof useGameData>;
  operation: ReturnType<typeof useOverviewOperation>['operation'];
}) {
  const { showNotification } = useNotification();
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const activeScope = useRef({ activeAccountId, activeGameId });
  activeScope.current = { activeAccountId, activeGameId };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { data: catalogData, error: catalogError, refetch: refetchCatalog } = catalogQuery;
  const { refetch, profile } = gameQuery;
  const updateBoundAccountScore = useSession(s => s.updateBoundAccountScore);
  const syncData = useCallback(async (): Promise<boolean> => {
    if (!operation.begin()) return false;
    setRefreshing(true);
    const foregroundSignal = activeGameId === 'rizline' ? getForegroundAbortSignal() : undefined;
    const gameGeneration = resourceWriteGeneration('rizline');
    let accountGeneration = resourceWriteGeneration(`account:${activeAccountId}`);
    const isCurrent = () => activeGameId !== 'rizline' || (mounted.current && !foregroundSignal?.aborted
      && activeScope.current.activeAccountId === activeAccountId && activeScope.current.activeGameId === activeGameId
      && resourceWriteGeneration('rizline') === gameGeneration
      && resourceWriteGeneration(`account:${activeAccountId}`) === accountGeneration);
    try {
      // 用户主动同步优先，终止登录后仍可能在后台运行的同账号自动刷新。
      accountGeneration = await cancelStaleSyncQueries(activeGameId, activeAccountId);
      if (!isCurrent()) return false;
      const account = boundAccounts.find((item) => item.id === activeAccountId);
      await refreshDivingFishForSync({
        account, activeSession, catalogData, catalogError, refetchCatalog, updateBoundAccountScore,
        ratingDigits: profile.ratingDigits,
      });
      if (activeGameId === 'phigros') await refreshPhigrosCatalog();
      let rizlineCatalogFailed = false;
      if (activeGameId === 'rizline') {
        rizlineCatalogFailed = await refreshRizlineCatalogBestEffort();
        if (!isCurrent()) return false;
      }
      // 先把相关页面标为过期但不并发请求，再只刷新当前总览一次。
      await invalidateAccountDataQueries(queryClient, 'none');
      const refreshed = await refetch();
      if (!isCurrent()) return false;
      // 缓存优先下 refetch 会立即返回打标缓存；等同一账号后台网络读取落定后，以最终缓存判定。
      await SYNC_FRESH_WAITERS[activeGameId]?.(activeAccountId);
      if (!isCurrent()) return false;
      const payload = readSettledGameDataBundle(
        activeAccountId,
        activeGameId,
        account?.providerId ?? null,
        activeSession?.mode ?? null,
      )?.payload ?? refreshed.data?.payload;
      if (activeGameId === 'maimai' && account?.providerId === 'lxns') {
        if (!checkMaimaiLxnsFresh(payload, showNotification)) return false;
      } else if (activeGameId === 'chunithm') {
        if (!checkChunithmFresh(payload, showNotification)) return false;
      }
      if (activeGameId === 'majdata-net') checkMajdataFresh(payload);
      if (activeGameId === 'rizline'
        && !checkRizlineFresh({ payload, refreshed, catalogFailed: rizlineCatalogFailed, notify: showNotification })) return false;
      if (refreshed.isError) {
        showNotification({
          title: '刷新失败',
          message: '当前仍显示缓存，请稍后重试。',
          variant: 'warning',
        });
        return false;
      }
      return true;
    } catch (syncError) {
      if (!isCurrent()) return false;
      showNotification({
        title: '同步失败',
        message: providerErrorToUserMessage(syncError, '暂时无法同步成绩，请稍后重试。'),
        variant: 'error',
      });
      return false;
    } finally {
      operation.finish();
      setRefreshing(false);
    }
  }, [activeAccountId, activeGameId, activeSession, boundAccounts, catalogData, catalogError, profile.ratingDigits,
    refetch, refetchCatalog, showNotification, updateBoundAccountScore, operation]);

  return { syncData, refreshing };
}
