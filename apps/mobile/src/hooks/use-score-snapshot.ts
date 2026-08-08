import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { ScoreService } from '@/services/score-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';

const repository = new SqliteSnapshotRepository();

/** 仅舞萌成绩快照。其他游戏请用 useGameData，避免把空壳游戏接到舞萌流水线上。 */
export function useScoreSnapshot() {
  const session = useSession((s) => s.session);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const enabled = activeGameId === 'maimai';
  const persistScores = enabled && shouldPersistScoreSnapshot(activeProviderId);
  const persistCatalog = enabled && shouldPersistMaimaiCatalog(activeProviderId);
  const queryKey = ['score-snapshot', activeAccountId, activeGameId, activeProviderId, session?.mode ?? 'fixture'];
  const query = useQuery({
    enabled,
    queryKey,
    queryFn: () => {
      const service = new ScoreService(
        scoreProvider,
        catalogProvider,
        activeAccountId,
        persistScores ? repository : undefined,
        persistCatalog ? repository : undefined,
      );
      // 缓存优先：先渲染 SQLite 快照，后台刷新成功后静默回写。
      // local/maimai-test 账号同样启用：首屏不再等待曲库网络拉取。
      if (persistScores) {
        return service.loadCacheFirst((fresh) => {
          queryClient.setQueryData(queryKey, fresh);
        }, activeProviderId !== 'local');
      }
      return service.load();
    },
  });
  return {
    ...query,
    isDataStale: !!query.data && (query.data.source.isStale || query.data.catalogSource.isStale),
  };
}
