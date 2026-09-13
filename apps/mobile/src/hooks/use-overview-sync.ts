import { useCallback, useState } from 'react';
import { useNotification } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import { formatPlayerScore } from '@/domain/game-data';
import type { GameId } from '@/domain/game-bind-options';
import type { ProviderSession } from '@/providers/contracts';
import { providerErrorToUserMessage } from '@/providers/errors';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { refreshDivingFishAccounts } from '@/services/refresh-diving-fish-accounts';
import { refreshPhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { awaitScoreFresh } from '@/services/score-service';
import { awaitChunithmFresh } from '@/services/chunithm-personal-service';
import { readSettledGameDataBundle } from '@/services/game-data-query';
import type { useGameData } from '@/hooks/use-game-data';
import type { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import type { useOverviewOperation } from '@/hooks/use-overview-operation';

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
  const { data: catalogData, error: catalogError, refetch: refetchCatalog } = catalogQuery;
  const { refetch, profile } = gameQuery;
  const updateBoundAccountScore = useSession(s => s.updateBoundAccountScore);
  const syncData = useCallback(async (): Promise<boolean> => {
    if (!operation.begin()) return false;
    setRefreshing(true);
    try {
      // 用户主动同步优先，终止登录后仍可能在后台运行的同账号自动刷新。
      await queryClient.cancelQueries({ queryKey: ['game-data'] });
      const account = boundAccounts.find((item) => item.id === activeAccountId);
      if (account?.providerId === 'diving-fish'
        && activeSession?.mode === 'import-token') {
        const catalog = catalogData ?? (await refetchCatalog()).data;
        if (!catalog) throw catalogError ?? new Error('舞萌曲库尚未就绪，请稍后重试');
        const result = await refreshDivingFishAccounts({
          accounts: [account],
          sessionsByAccountId: { [account.id]: activeSession },
          catalog,
        });
        const refreshed = result.refreshed[0];
        if (!refreshed) throw result.failed[0]?.error ?? new Error('水鱼账号同步失败');
        updateBoundAccountScore(
          account.id,
          formatPlayerScore(refreshed.snapshot.best50.rating, profile.ratingDigits),
          refreshed.snapshot.player.displayName,
        );
      }
      if (activeGameId === 'phigros') await refreshPhigrosCatalog();
      // 先把相关页面标为过期但不并发请求，再只刷新当前总览一次。
      await invalidateAccountDataQueries(queryClient, 'none');
      const refreshed = await refetch();
      // 缓存优先下 refetch 会立即返回打标缓存；等同一账号后台网络读取落定后，以最终缓存判定。
      if (activeGameId === 'maimai') await awaitScoreFresh(activeAccountId);
      else if (activeGameId === 'chunithm') await awaitChunithmFresh(activeAccountId);
      const payload = readSettledGameDataBundle(
        activeAccountId,
        activeGameId,
        account?.providerId ?? null,
        activeSession?.mode ?? null,
      )?.payload ?? refreshed.data?.payload;
      if (activeGameId === 'maimai' && account?.providerId === 'lxns') {
        const isFreshMaimaiData = payload?.kind === 'maimai' && !payload.source.isStale;
        if (!isFreshMaimaiData) {
          showNotification({
            title: '尚未读取到新数据',
            message: payload?.kind === 'maimai' && payload.source.isStale
              ? '本次仅读取到缓存，请关闭代理并检查网络后重试。'
              : '请确认微信已完成上传、代理已经关闭，再重试同步。',
            variant: 'warning',
          });
          return false;
        }
      } else if (activeGameId === 'chunithm') {
        const isFreshChunithmData = payload?.kind === 'chunithm'
          && payload.hasSyncedData
          && !payload.source.isStale;
        if (!isFreshChunithmData) {
          showNotification({
            title: '尚未读取到新数据',
            message: payload?.kind === 'chunithm' && payload.source.isStale
              ? '本次仅读取到缓存，请关闭代理并检查网络后重试。'
              : '请确认微信已提示上传完成、代理已经关闭，再重试同步。',
            variant: 'warning',
          });
          return false;
        }
      }
      if (activeGameId === 'majdata-net' && (payload?.kind !== 'majdata-net' || payload.source.isStale)) throw new Error('Majdata refresh failed');
      return true;
    } catch (syncError) {
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
