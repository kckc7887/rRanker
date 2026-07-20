import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  emptyGamePayload,
  formatPlayerScore,
  maimaiPayloadFromSnapshot,
  type GameDataBundle,
} from '@/domain/game-data';
import { buildLxnsIconUrl, buildPhigrosAvatarUrl } from '@/domain/account-avatar';
import { getGameProfile } from '@/domain/game-profile';
import { ScoreService } from '@/services/score-service';
import { persistBoundAccountAvatar } from '@/services/hydrate-bound-account-avatars';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';

const repository = new SqliteSnapshotRepository();
const GAME_DATA_QUERY_VERSION = 12;

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
          const catalogProvider = new PhigrosCatalogProvider();
          const [player, records, bestSections, gameVersion, summary] = await Promise.all([
            scoreProvider.getPlayer(),
            scoreProvider.getRecords(),
            scoreProvider.getBestSections(),
            catalogProvider.getGameVersion(),
            scoreProvider.getSummary(),
          ]);

          const saveUpdatedAt = scoreProvider.getSaveUpdatedAt() ?? new Date().toISOString();
          const source = {
            kind: 'generated' as const,
            label: 'TapTap云存档',
            updatedAt: saveUpdatedAt,
            isStale: false,
          };
          const catalogSource = {
            kind: 'generated' as const,
            label: `Phigros${gameVersion}`,
            updatedAt: new Date().toISOString(),
            isStale: false,
          };
          const rks = player.rating;
          const avatarUrl = buildPhigrosAvatarUrl(gameVersion, summary.avatar);
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
                value: rks,
                display: rks.toFixed(4),
              },
              source,
              catalogSource,
              avatarUrl,
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
      const avatarUrl = d.providerId === 'lxns'
        ? buildLxnsIconUrl(d.payload.player.presentation?.iconId)
        : undefined;
      updateBoundAccountScore(
        activeAccountId,
        formatPlayerScore(d.payload.playerScore.value, d.profile.ratingDigits),
        d.payload.player.displayName,
        avatarUrl,
      );
      if (avatarUrl) {
        void persistBoundAccountAvatar(activeAccountId, avatarUrl);
      }
    }
    if (d.payload.kind === 'phigros') {
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player.displayName,
        d.payload.avatarUrl ?? null,
      );
      if (d.payload.avatarUrl) {
        void persistBoundAccountAvatar(activeAccountId, d.payload.avatarUrl);
      }
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
