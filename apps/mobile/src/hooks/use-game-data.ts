import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  emptyGamePayload,
  formatPlayerScore,
  maimaiPayloadFromSnapshot,
  type GameDataBundle,
} from '@/domain/game-data';
import { getGameProfile } from '@/domain/game-profile';
import { ScoreService } from '@/services/score-service';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';

const repository = new SqliteSnapshotRepository();
const GAME_DATA_QUERY_VERSION = 5;

export function useGameData() {
  const session = useSession((s) => s.session);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const updateBoundAccountScore = useSession((s) => s.updateBoundAccountScore);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const profile = getGameProfile(activeGameId);

  const query = useQuery({
    queryKey: ['game-data', GAME_DATA_QUERY_VERSION, activeAccountId, activeGameId, activeProviderId, session?.mode ?? 'none'],
    queryFn: async (): Promise<GameDataBundle> => {
      if (activeGameId === 'test') {
        return {
          gameId: 'test',
          providerId: null,
          profile: getGameProfile('test'),
          payload: emptyGamePayload('test', '测试游戏'),
        };
      }
      if (activeGameId === 'phigros') {
        if (scoreProvider instanceof PhigrosScoreProvider) {
          scoreProvider.invalidateCache();
          const [player, records, b30, bestSections] = await Promise.all([
            scoreProvider.getPlayer(),
            scoreProvider.getRecords(),
            scoreProvider.getB30(),
            scoreProvider.getBestSections(),
          ]);

          const source = { kind: 'generated' as const, label: 'Phigros 云存档', updatedAt: new Date().toISOString(), isStale: false };
          return {
            gameId: 'phigros' as const,
            providerId: 'phi-taptap' as const,
            profile: getGameProfile('phigros'),
            payload: {
              kind: 'phigros' as const,
              player,
              records,
              bestSections,
              playerScore: {
                label: 'RKS',
                value: b30.rks,
                display: b30.rks.toFixed(2),
              },
              source,
              catalogSource: source,
            },
          };
        }

        return {
          gameId: 'phigros' as const,
          providerId: null,
          profile: getGameProfile('phigros'),
          payload: emptyGamePayload('phigros', 'Phigros'),
        };
      }

      // 无绑定账号 / 未选中查分器：按空数据处理，不走成绩 provider。
      if (!activeProviderId || !activeAccountId || activeAccountId === UNBOUND_ACCOUNT_ID) {
        return {
          gameId: 'maimai',
          providerId: null,
          profile: getGameProfile('maimai'),
          payload: emptyGamePayload('maimai', '未绑定账号'),
        };
      }

      const persistScores = shouldPersistScoreSnapshot(activeProviderId);
      const persistCatalog = shouldPersistMaimaiCatalog(activeProviderId);
      const snapshot = await new ScoreService(
        scoreProvider,
        catalogProvider,
        activeAccountId,
        persistScores ? repository : undefined,
        persistCatalog ? repository : undefined,
      ).load();

      return {
        gameId: 'maimai',
        providerId: activeProviderId,
        profile: getGameProfile('maimai'),
        payload: maimaiPayloadFromSnapshot(snapshot, getGameProfile('maimai')),
      };
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const d = query.data;
    if (d.payload.kind === 'maimai') {
      updateBoundAccountScore(
        activeAccountId,
        formatPlayerScore(d.payload.playerScore.value, d.profile.ratingDigits),
        d.payload.player.displayName,
      );
    }
    if (d.payload.kind === 'phigros') {
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player.displayName,
      );
    }
  }, [activeAccountId, query.data, updateBoundAccountScore]);

  return {
    ...query,
    profile,
    activeGameId,
    activeProviderId,
    activeAccountId,
    isDataStale: !!query.data && (query.data.payload.kind === 'maimai' || query.data.payload.kind === 'phigros')
      && (query.data.payload.source.isStale || query.data.payload.catalogSource.isStale),
  };
}
