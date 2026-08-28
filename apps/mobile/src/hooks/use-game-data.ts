import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  emptyGamePayload,
  formatPlayerScore,
  maimaiPayloadFromSnapshot,
  osuPayloadFromSnapshot,
  type GameDataBundle,
} from '@/domain/game-data';
import { buildLxnsIconUrl } from '@/domain/account-avatar';
import { resolvePhigrosAvatarUrl } from '@/domain/phigros-avatar-resolver';
import { getGameProfile } from '@/domain/game-profile';
import { ScoreService, staleCachedSnapshot } from '@/services/score-service';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { persistBoundAccountThumbnail } from '@/services/account-thumbnail';
import { queryClient } from '@/state/query-client';
import type { ScoreSnapshot, DataSource } from '@/domain/models';
import type { ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import {
  applyLxnsTokenRotation,
  applyOsuTokenRotation,
  UNBOUND_ACCOUNT_ID,
  useSession,
} from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { formatPhigrosDataMoney } from '@/domain/phigros';
import { PhigrosSaveCache, stalePhigrosPayload, type PhigrosGameDataPayload } from '@/services/phigros-save-cache';
import { staleCached } from '@/services/cache-first';
import { gameDataQueryKey } from '@/services/game-data-query';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import { isOsuGameId } from '@/domain/game-mode-family';
import { loadOsuSnapshotFresh, OsuCache } from '@/services/osu-cache';
import type { OsuSnapshot } from '@/domain/osu';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import {
  osuUserIdFromAccountId,
  tufPlayerIdFromAccountId,
  museDashUserIdFromAccountId,
  isMuseDashTestUserId,
  phiraPlayerIdFromAccountId,
} from '@/domain/bound-account';
import {
  loadTufPlayerFresh,
  makeTufSnapshot,
  TufCache,
} from '@/services/tuf-cache';
import {
  loadMuseDashPlayerFresh,
  makeMuseDashSnapshot,
  MuseDashCache,
} from '@/services/muse-dash-cache';
import { resolveTufAvatarUrl, type TufPlayer } from '@/domain/tuf';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import { buildChunithmMapIconUrl } from '@/domain/chunithm-personal';
import { buildMaxedChunithmSnapshot } from '@/providers/maxed-chunithm-test-provider';
import {
  buildMaxedPhigrosSnapshot,
  MaxedPhigrosTestProvider,
} from '@/providers/maxed-phigros-test-provider';
import { maxedMuseDashPlayerSnapshot } from '@/providers/maxed-musedash-test-provider';
import { phiraCache } from '@/services/phira-cache';
import { loadPhiraPlayerFresh, refreshPhiraSeedBests } from '@/services/phira-service';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { ensureMaimaiCatalog } from '@/hooks/use-detailed-catalog';
import { ensureChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { ensureMuseDashAlbums, ensureMuseDashDiffdiff } from '@/hooks/use-muse-dash';
import { ensurePhigrosCatalog } from '@/hooks/use-phigros-catalog';

const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();
const museDashCache = new MuseDashCache();
const osuCache = new OsuCache();

export function useGameData(enabled = true) {
  const tabActive = useCachedTabActive();
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

  const queryKey = gameDataQueryKey(
    activeAccountId,
    activeGameId,
    activeProviderId,
    session?.mode ?? null,
  );

  const query = useQuery({
    queryKey,
    enabled: enabled && tabActive,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryFn: async ({ signal }): Promise<GameDataBundle> => {
      const hasSessionData = queryClient.getQueryData<GameDataBundle>(queryKey) !== undefined;
      if (activeGameId === 'phira') {
        const playerId = phiraPlayerIdFromAccountId(activeAccountId);
        if (activeProviderId !== 'phira-community' || playerId === null) {
          return { gameId: 'phira', providerId: null, profile: getGameProfile('phira'), payload: emptyGamePayload('phira', '未绑定 Phira 玩家') };
        }
        const phiraProfile = getGameProfile('phira');
        const toBundle = async (snapshot: Awaited<ReturnType<typeof loadPhiraPlayerFresh>>): Promise<GameDataBundle> => ({
          gameId: 'phira', providerId: 'phira-community', profile: phiraProfile,
          payload: { kind: 'phira', snapshot, bests: await phiraCache.loadBests(playerId),
            playerScore: { label: 'Ranking Score', value: snapshot.player.rks, display: snapshot.player.rks.toFixed(phiraProfile.ratingDigits) }, source: snapshot.source },
        });
        const stored = hasSessionData ? null : await phiraCache.loadPlayer(playerId);
        const snapshot = stored
          ? staleCached(stored)
          : await loadPhiraPlayerFresh(playerId, signal);
        if (!stored) {
          void refreshPhiraSeedBests(snapshot, signal).then(() => toBundle(snapshot))
            .then((bundle) => {
              if (!signal.aborted) queryClient.setQueryData(queryKey, bundle);
            }).catch(() => undefined);
        }
        return toBundle(snapshot);
      }
      if (activeGameId === 'adofai') {
        const playerId = tufPlayerIdFromAccountId(activeAccountId);
        if (activeProviderId !== 'tuf' || playerId === null) {
          return {
            gameId: 'adofai', providerId: null, profile: getGameProfile('adofai'),
            payload: emptyGamePayload('adofai', '未绑定 TUF 玩家'),
          };
        }
        const toBundle = (player: TufPlayer, source: DataSource): GameDataBundle => ({
          gameId: 'adofai', providerId: 'tuf', profile: getGameProfile('adofai'),
          payload: {
            kind: 'adofai', player,
            playerScore: {
              label: 'RANKED SCORE', value: player.rankedScore,
              display: Number.isFinite(player.rankedScore) ? player.rankedScore.toFixed(2) : '—',
            },
            source,
          },
        });
        const stored = hasSessionData ? null : await tufCache.loadPlayer(playerId);
        const snapshot = stored
          ? staleCached(stored)
          : makeTufSnapshot(await loadTufPlayerFresh(playerId, signal));
        if (!stored && !signal.aborted) void tufCache.savePlayer(playerId, snapshot).catch(() => undefined);
        return toBundle(snapshot.data, snapshot.source);
      }
      if (activeGameId === 'musedash') {
        const userId = museDashUserIdFromAccountId(activeAccountId);
        if (activeProviderId === 'musedash-test' && userId !== null && isMuseDashTestUserId(userId)) {
          const toBundle = (player: MuseDashPlayer, source: DataSource): GameDataBundle => ({
            gameId: 'musedash', providerId: 'musedash-test', profile: getGameProfile('musedash'),
            payload: {
              kind: 'musedash', player,
              playerScore: {
                label: 'Rating', value: player.rl ?? 0,
                display: player.rl == null || !Number.isFinite(player.rl) ? '—' : player.rl.toFixed(2),
              },
              source,
            },
          });
          // 示例账号首屏优先读取曲库和定数表缓存。
          const [albums, diffdiff] = await Promise.all([
            ensureMuseDashAlbums(),
            ensureMuseDashDiffdiff(),
          ]);
          const snapshot = maxedMuseDashPlayerSnapshot(
            albums.data,
            diffdiff.data,
            activeAccount?.displayName ?? '示例账号',
          );
          return toBundle(snapshot.data, snapshot.source);
        }
        if (activeProviderId !== 'musedash-moe' || userId === null) {
          return {
            gameId: 'musedash', providerId: null, profile: getGameProfile('musedash'),
            payload: emptyGamePayload('musedash', '未绑定喵斯快跑玩家'),
          };
        }
        const toBundle = (player: MuseDashPlayer, source: DataSource): GameDataBundle => ({
          gameId: 'musedash', providerId: 'musedash-moe', profile: getGameProfile('musedash'),
          payload: {
            kind: 'musedash', player,
            playerScore: {
              label: 'Rating', value: player.rl ?? 0,
              display: player.rl == null || !Number.isFinite(player.rl) ? '—' : player.rl.toFixed(2),
            },
            source,
          },
        });
        const stored = hasSessionData ? null : await museDashCache.loadPlayer(userId);
        const snapshot = stored
          ? staleCached(stored)
          : makeMuseDashSnapshot(await loadMuseDashPlayerFresh(userId, signal));
        if (!stored && !signal.aborted) void museDashCache.savePlayer(userId, snapshot).catch(() => undefined);
        return toBundle(snapshot.data, snapshot.source);
      }
      if (activeGameId === 'chunithm') {
        if (activeProviderId === 'chunithm-test') {
          const toBundle = (catalog: ChunithmCatalogSnapshot): GameDataBundle => {
            const snapshot = buildMaxedChunithmSnapshot(
              catalog,
              activeAccount?.displayName ?? '示例账号',
            );
            return {
              gameId: 'chunithm',
              providerId: 'chunithm-test',
              profile: getGameProfile('chunithm'),
              payload: {
                kind: 'chunithm',
                player: snapshot.player,
                scores: snapshot.scores,
                bestSections: [
                  { id: 'b30', title: 'Best 30', scores: snapshot.bests.bests },
                  { id: 'new20', title: 'New 20', scores: snapshot.bests.new_bests },
                ],
                selections: snapshot.bests.selections,
                playerScore: {
                  label: 'RATING',
                  value: snapshot.player.rating,
                  display: snapshot.player.rating.toFixed(2),
                },
                source: snapshot.source,
                hasSyncedData: true,
              },
            };
          };
          // 示例账号仍由真实公开曲库生成，但公开曲库只保留在本次 React Query 会话。
          return ensureChunithmCatalog().then(toBundle);
        }
        if (activeProviderId === 'lxns' && session?.mode === 'lxns-oauth') {
          const provider = new ChunithmScoreProvider(
            session,
            (next) => applyLxnsTokenRotation(activeAccountId, next),
          );
          const service = new ChunithmPersonalService(
            provider,
            repository,
            activeAccountId,
          );
          const toBundle = (snapshot: ChunithmPersonalSnapshot): GameDataBundle => ({
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
              selections: snapshot.bests.selections,
              playerScore: {
                label: 'RATING',
                value: snapshot.player?.rating ?? 0,
                display: snapshot.player ? snapshot.player.rating.toFixed(2) : '—',
              },
              source: snapshot.source,
              hasSyncedData: snapshot.player !== null,
            },
          });
          const cached = hasSessionData ? null : await service.loadCached();
          const snapshot = cached ?? await service.load(signal);
          return toBundle(snapshot);
        }
        return {
          gameId: 'chunithm',
          providerId: activeProviderId,
          profile: getGameProfile('chunithm'),
          payload: emptyGamePayload('chunithm', '临时账号'),
        };
      }
      if (isOsuGameId(activeGameId)) {
        const userId = osuUserIdFromAccountId(activeAccountId);
        if (activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null) {
          const provider = new OsuScoreProvider(
            session,
            (next) => applyOsuTokenRotation(activeAccountId, next),
          );
          const toBundle = (snapshot: OsuSnapshot): GameDataBundle => ({
            gameId: activeGameId,
            providerId: 'osu',
            profile: getGameProfile(activeGameId),
            payload: osuPayloadFromSnapshot(snapshot, getGameProfile(activeGameId)),
          });
          const stored = hasSessionData ? null : await osuCache.load(activeGameId, userId);
          const snapshot = stored
            ? staleCached(stored)
            : await loadOsuSnapshotFresh(provider, activeGameId, userId, signal);
          if (!stored && !signal.aborted) void osuCache.save(activeGameId, userId, snapshot).catch(() => undefined);
          return toBundle(snapshot);
        }
        return {
          gameId: activeGameId,
          providerId: activeProviderId,
          profile: getGameProfile(activeGameId),
          payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号'),
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
        if (scoreProvider instanceof MaxedPhigrosTestProvider) {
          const phiCatalog = catalogProvider instanceof PhigrosCatalogProvider
            ? catalogProvider
            : new PhigrosCatalogProvider();
          const catalog = (await ensurePhigrosCatalog(phiCatalog)).snapshot;
          const snapshot = buildMaxedPhigrosSnapshot(
            catalog,
            activeAccount?.displayName ?? '示例账号',
          );
          return {
            gameId: 'phigros' as const,
            providerId: 'phigros-test' as const,
            profile: getGameProfile('phigros'),
            payload: {
              kind: 'phigros' as const,
              player: snapshot.player,
              records: snapshot.records,
              bestSections: snapshot.bestSections,
              playerScore: {
                label: 'Raking Score',
                value: snapshot.player.rating,
                display: snapshot.player.rating.toFixed(4),
              },
              challengeModeRank: snapshot.challengeModeRank,
              source: snapshot.source,
              saveUpdatedAt: snapshot.source.updatedAt,
              catalogSource: catalog.source,
              avatarUrl: null,
              avatarKey: null,
              backgroundSongId: null,
              dataAmount: '0KiB',
              progress: snapshot.progress,
            },
          };
        }
        if (scoreProvider instanceof PhigrosScoreProvider) {
          const phiCatalog = catalogProvider instanceof PhigrosCatalogProvider
            ? catalogProvider
            : new PhigrosCatalogProvider();
          const loadFresh = async (): Promise<PhigrosGameDataPayload> => {
            scoreProvider.invalidateCache();
            // 复用会话里的曲库 provider，避免每次同步成绩都新建实例并重拉 OSS、误刷新资源时间。
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
            };
          };
          const toBundle = (payload: PhigrosGameDataPayload): GameDataBundle => ({
            gameId: 'phigros' as const,
            providerId: 'phi-taptap' as const,
            profile: getGameProfile('phigros'),
            payload,
          });
          const cache = new PhigrosSaveCache(repository);
          const stored = hasSessionData ? null : await cache.load(activeAccountId);
          const payload = stored ? stalePhigrosPayload(stored) : await loadFresh();
          if (!stored && !signal.aborted) {
            void cache.save(activeAccountId, payload).catch(() => undefined);
          }
          return toBundle(payload);
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
      const service = new ScoreService(
        scoreProvider,
        catalogProvider,
        activeAccountId,
        persistScores ? repository : undefined,
        persistCatalog ? repository : undefined,
        (detailed, catalogSignal) => detailed
          ? catalogProvider.getDetailedCatalog(catalogSignal)
          : ensureMaimaiCatalog(catalogProvider),
      );
      const toBundle = (snapshot: ScoreSnapshot): GameDataBundle => ({
        gameId: 'maimai',
        providerId: activeProviderId,
        profile: getGameProfile('maimai'),
        payload: maimaiPayloadFromSnapshot(snapshot, getGameProfile('maimai')),
      });
      // 首次进入优先复用本地快照；已有会话数据后的显式 refetch 才读取网络。
      if (persistScores && !hasSessionData) {
        const cached = await repository.getLatest(activeAccountId);
        if (cached) {
          return toBundle(activeProviderId === 'local' ? cached : staleCachedSnapshot(cached));
        }
      }
      const snapshot = await service.load(signal);
      return toBundle(snapshot);
    },
  });

  useEffect(() => {
    if (!query.data?.payload || !activeAccountId) return;
    const d = query.data;
    if (d.payload.kind === 'maimai') {
      const avatarUrl = d.providerId === 'lxns'
        ? buildLxnsIconUrl(d.payload.player.presentation?.iconId)
        : undefined;
      const scoreDisplay = formatPlayerScore(d.payload.playerScore.value, d.profile.ratingDigits);
      updateBoundAccountScore(
        activeAccountId,
        scoreDisplay,
        d.payload.player.displayName,
        avatarUrl,
      );
      void persistBoundAccountThumbnail(activeAccountId, {
        scoreDisplay,
        avatarUrl: avatarUrl ?? undefined,
      }).catch(() => undefined);
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
      void persistBoundAccountThumbnail(activeAccountId, {
        scoreDisplay: d.payload.playerScore.display,
        avatarUrl: d.payload.avatarUrl ?? undefined,
        challengeModeRank: d.payload.challengeModeRank,
      }).catch(() => undefined);
      if (d.providerId === 'phi-taptap') {
        void new SecureSessionStore().updateAccountMetadata(activeAccountId, {
          displayName: d.payload.player.displayName,
          scoreDisplay: d.payload.playerScore.display,
          challengeModeRank: d.payload.challengeModeRank,
        }).catch(() => undefined);
      }
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
        undefined,
        d.payload.player?.rating_possession ?? null,
      );
      void persistBoundAccountThumbnail(activeAccountId, {
        scoreDisplay: d.payload.playerScore.display,
        avatarUrl: avatarUrl ?? undefined,
        ratingPossession: d.payload.player?.rating_possession ?? null,
      }).catch(() => undefined);
      if (d.providerId === 'lxns') {
        void new SecureSessionStore().updateAccountMetadata(activeAccountId, {
          displayName: d.payload.player?.name ?? '落雪账号（待同步）',
          scoreDisplay: d.payload.playerScore.display,
          ratingPossession: d.payload.player?.rating_possession ?? null,
        }).catch(() => undefined);
      }
      if (avatarUrl) {
        void persistBoundAccountAvatar(activeAccountId, avatarUrl);
      }
    }
    if (d.payload.kind === 'adofai') {
      const avatarUrl = resolveTufAvatarUrl(d.payload.player);
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player.name,
        avatarUrl ?? undefined,
      );
      void persistBoundAccountThumbnail(activeAccountId, {
        scoreDisplay: d.payload.playerScore.display,
        avatarUrl: avatarUrl ?? undefined,
      }).catch(() => undefined);
      if (avatarUrl) void persistBoundAccountAvatar(activeAccountId, avatarUrl);
    }
    if (d.payload.kind === 'musedash') {
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player.user.nickname,
      );
      void persistBoundAccountThumbnail(activeAccountId, {
        scoreDisplay: d.payload.playerScore.display,
      }).catch(() => undefined);
    }
    if (d.payload.kind === 'phira') {
      updateBoundAccountScore(activeAccountId, d.payload.playerScore.display, d.payload.snapshot.player.name, d.payload.snapshot.player.avatar ?? undefined);
      void persistBoundAccountThumbnail(activeAccountId, { scoreDisplay: d.payload.playerScore.display, avatarUrl: d.payload.snapshot.player.avatar ?? undefined }).catch(() => undefined);
    }
    if (d.payload.kind === 'osu') {
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player.username,
        d.payload.player.avatarUrl ?? undefined,
      );
      void persistBoundAccountThumbnail(activeAccountId, {
        scoreDisplay: d.payload.playerScore.display,
        avatarUrl: d.payload.player.avatarUrl ?? undefined,
      }).catch(() => undefined);
      if (d.payload.player.avatarUrl) {
        void persistBoundAccountAvatar(activeAccountId, d.payload.player.avatarUrl);
      }
    }
  }, [activeAccountId, query.data, updateBoundAccountScore]);

  return {
    ...query,
    profile,
    activeGameId,
    activeProviderId,
    activeAccountId,
    isDataStale: !!query.data?.payload && (
      query.data.payload.kind === 'chunithm'
        ? query.data.payload.source.isStale
        : query.data.payload.kind === 'adofai'
          ? query.data.payload.source.isStale
          : query.data.payload.kind === 'musedash'
            ? query.data.payload.source.isStale
          : query.data.payload.kind === 'phira'
            ? query.data.payload.source.isStale
          : query.data.payload.kind === 'osu'
            ? query.data.payload.source.isStale
        : (query.data.payload.kind === 'maimai' || query.data.payload.kind === 'phigros')
          && (query.data.payload.source.isStale || query.data.payload.catalogSource.isStale)
    ),
  };
}
