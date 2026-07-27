import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  emptyGamePayload,
  formatPlayerScore,
  maimaiPayloadFromSnapshot,
  type GameDataBundle,
} from '@/domain/game-data';
import { buildLxnsIconUrl } from '@/domain/account-avatar';
import { resolvePhigrosAvatarUrl } from '@/domain/phigros-avatar-resolver';
import { getGameProfile } from '@/domain/game-profile';
import { ScoreService } from '@/services/score-service';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import {
  applyLxnsTokenRotation,
  UNBOUND_ACCOUNT_ID,
  useSession,
} from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { formatPhigrosDataMoney } from '@/domain/phigros';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import { buildChunithmMapIconUrl } from '@/domain/chunithm-personal';

const repository = new SqliteSnapshotRepository();
const GAME_DATA_QUERY_VERSION = 17;

export function useGameData() {
  const session = useSession((s) => s.session);
  const activeGameId = useSession((s) => s.activeGameId);
  const activeProviderId = useSession((s) => s.activeProviderId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const activeAccount = useSession((s) => (
    s.boundAccounts.find((account) => account.id === s.activeAccountId)
  ));
  const updateBoundAccountScore = useSession((s) => s.updateBoundAccountScore);
  const scoreProvider = useSession((s) => s.scoreProvider);
  const catalogProvider = useSession((s) => s.catalogProvider);
  const profile = getGameProfile(activeGameId);

  const query = useQuery({
    queryKey: ['game-data', GAME_DATA_QUERY_VERSION, activeAccountId, activeGameId, activeProviderId, session?.mode ?? 'none'],
    queryFn: async (): Promise<GameDataBundle> => {
      if (activeGameId === 'chunithm') {
        if (activeProviderId === 'lxns' && session?.mode === 'lxns-oauth') {
          const provider = new ChunithmScoreProvider(
            session,
            (next) => applyLxnsTokenRotation(activeAccountId, next),
          );
          const snapshot = await new ChunithmPersonalService(
            provider,
            repository,
            activeAccountId,
          ).load();
          return {
            gameId: 'chunithm',
            providerId: 'lxns',
            profile: getGameProfile('chunithm'),
            payload: {
              kind: 'chunithm',
              player: snapshot.player,
              scores: snapshot.scores,
              bestSections: [
                { id: 'b30', title: 'Best 30', scores: snapshot.bests.bests },
                { id: 'new20', title: 'New 20', scores: snapshot.bests.new_bests },
              ],
              playerScore: {
                label: 'RATING',
                value: snapshot.player?.rating ?? 0,
                display: snapshot.player ? snapshot.player.rating.toFixed(2) : '—',
              },
              source: snapshot.source,
              hasSyncedData: snapshot.player !== null,
            },
          };
        }
        return {
          gameId: 'chunithm',
          providerId: activeProviderId,
          profile: getGameProfile('chunithm'),
          payload: emptyGamePayload('chunithm', '临时账号'),
        };
      }
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
          // 复用会话里的曲库 provider，避免每次同步成绩都新建实例并重拉 OSS、误刷新资源时间。
          const phiCatalog = catalogProvider instanceof PhigrosCatalogProvider
            ? catalogProvider
            : new PhigrosCatalogProvider();
          const [player, records, bestSections, gameVersion, summary, userProfile, gameProgress] = await Promise.all([
            scoreProvider.getPlayer(),
            scoreProvider.getRecords(),
            scoreProvider.getBestSections(),
            phiCatalog.getGameVersion(),
            scoreProvider.getSummary(),
            scoreProvider.getUserProfile(),
            scoreProvider.getGameProgress(),
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
            updatedAt: phiCatalog.getResourceUpdatedAt() ?? saveUpdatedAt,
            isStale: false,
          };
          const rks = player.rating;
          const avatarUrl = await resolvePhigrosAvatarUrl(gameVersion, summary.avatar);
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
                label: 'Raking Score',
                value: rks,
                display: rks.toFixed(4),
              },
              challengeModeRank: summary.challengeModeRank,
              source,
              saveUpdatedAt,
              catalogSource,
              avatarUrl,
              avatarKey: userProfile?.avatar || summary.avatar || null,
              backgroundSongId: userProfile?.backgroundSongId || null,
              dataAmount: formatPhigrosDataMoney(gameProgress?.money ?? []),
              progress: {
                cleared: summary.cleared,
                fullCombo: summary.fullCombo,
                phi: summary.phi,
              },
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

      if (activeProviderId === 'lxns'
        && activeAccount?.scoreDisplay === '—'
        && scoreProvider instanceof LxnsScoreProvider
        && await scoreProvider.getOptionalPlayer() === null) {
        return {
          gameId: 'maimai',
          providerId: 'lxns',
          profile: getGameProfile('maimai'),
          payload: emptyGamePayload('maimai', activeAccount.displayName),
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
    if (!query.data || !activeAccountId) return;
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
        d.payload.avatarUrl ?? undefined,
        d.payload.challengeModeRank,
      );
      void new SecureSessionStore().updateAccountMetadata(activeAccountId, {
        displayName: d.payload.player.displayName,
        scoreDisplay: d.payload.playerScore.display,
        challengeModeRank: d.payload.challengeModeRank,
      }).catch(() => undefined);
      if (d.payload.avatarUrl) {
        void persistBoundAccountAvatar(activeAccountId, d.payload.avatarUrl);
      }
    }
    if (d.payload.kind === 'chunithm') {
      const avatarUrl = buildChunithmMapIconUrl(d.payload.player?.map_icon?.id);
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player?.name,
        avatarUrl ?? undefined,
      );
      void new SecureSessionStore().updateAccountMetadata(activeAccountId, {
        displayName: d.payload.player?.name ?? '落雪账号（待同步）',
        scoreDisplay: d.payload.playerScore.display,
      }).catch(() => undefined);
      if (avatarUrl) {
        void persistBoundAccountAvatar(activeAccountId, avatarUrl);
      }
    }
  }, [activeAccountId, query.data, updateBoundAccountScore]);

  return {
    ...query,
    profile,
    activeGameId,
    activeProviderId,
    activeAccountId,
    isDataStale: !!query.data && (
      query.data.payload.kind === 'chunithm'
        ? query.data.payload.source.isStale
        : (query.data.payload.kind === 'maimai' || query.data.payload.kind === 'phigros')
          && (query.data.payload.source.isStale || query.data.payload.catalogSource.isStale)
    ),
  };
}
