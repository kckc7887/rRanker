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
import { ScoreService, staleCachedSnapshot } from '@/services/score-service';
import { persistBoundAccountAvatar } from '@/services/resolve-account-avatar-persist';
import { queryClient } from '@/state/query-client';
import type { ScoreSnapshot, DataSource } from '@/domain/models';
import type { ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
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
import { PhigrosSaveCache, stalePhigrosPayload, type PhigrosGameDataPayload } from '@/services/phigros-save-cache';
import { cacheFirstLoad, isCacheFallback } from '@/services/cache-first';
import { gameDataQueryKey } from '@/services/game-data-query';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import { ResourceService } from '@/services/resource-service';
import {
  CHUNITHM_CATALOG_RESOURCE_KEY,
  type ChunithmCatalogSnapshot,
} from '@/domain/chunithm';
import {
  CHUNITHM_CATALOG_SCHEMA_VERSION,
  loadChunithmCatalog,
} from '@/services/chunithm-catalog-loader';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import {
  loadTufPlayerFresh,
  makeTufSnapshot,
  TufCache,
} from '@/services/tuf-cache';
import type { TufPlayer } from '@/domain/tuf';
import { buildChunithmMapIconUrl } from '@/domain/chunithm-personal';
import { buildMaxedChunithmSnapshot } from '@/providers/maxed-chunithm-test-provider';
import {
  buildMaxedPhigrosSnapshot,
  MaxedPhigrosTestProvider,
} from '@/providers/maxed-phigros-test-provider';

const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();

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

  const queryKey = gameDataQueryKey(
    activeAccountId,
    activeGameId,
    activeProviderId,
    session?.mode ?? null,
  );

  const query = useQuery({
    queryKey,
    ...(activeGameId === 'adofai' ? { staleTime: 60_000, gcTime: 10 * 60_000 } : {}),
    queryFn: async (): Promise<GameDataBundle> => {
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
        // 缓存优先：先渲染本地玩家资料快照（打「数据可能过期」标），后台刷新成功后静默回写。
        const snapshot = await cacheFirstLoad({
          loadCached: () => tufCache.loadPlayer(playerId),
          loadFresh: async () => {
            const player = await loadTufPlayerFresh(playerId);
            const fresh = makeTufSnapshot(player);
            void tufCache.savePlayer(playerId, fresh).catch(() => undefined);
            return fresh;
          },
          onFresh: (fresh) => {
            queryClient.setQueryData(queryKey, toBundle(fresh.data, fresh.source));
          },
        });
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
          // 曲库缓存优先：中二曲库是全局公开资源，示例账号首屏不再等待网络拉取。
          return cacheFirstLoad({
            loadCached: () => new ResourceService(repository)
              .getCached<ChunithmCatalogSnapshot>(
                CHUNITHM_CATALOG_RESOURCE_KEY,
                CHUNITHM_CATALOG_SCHEMA_VERSION,
              ),
            loadFresh: () => loadChunithmCatalog(),
            onFresh: (fresh) => {
              queryClient.setQueryData(queryKey, toBundle(fresh));
            },
          }).then(toBundle);
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
          // 缓存优先：先渲染本地快照，后台刷新成功后静默回写。
          const snapshot = await service.loadCacheFirst((fresh) => {
            queryClient.setQueryData(queryKey, toBundle(fresh));
          });
          return toBundle(snapshot);
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
        if (scoreProvider instanceof MaxedPhigrosTestProvider) {
          const phiCatalog = catalogProvider instanceof PhigrosCatalogProvider
            ? catalogProvider
            : new PhigrosCatalogProvider();
          const catalog = await phiCatalog.getCatalog();
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
          // 缓存优先：先渲染上次成功同步的存档，后台刷新成功后持久化并静默回写。
          const payload = await cacheFirstLoad({
            loadCached: () => cache.load(activeAccountId),
            loadFresh,
            onFresh: (fresh) => {
              void cache.save(activeAccountId, fresh).catch(() => undefined);
              queryClient.setQueryData(queryKey, toBundle(fresh));
            },
            markStale: stalePhigrosPayload,
          });
          // 打标缓存（来自命中）不落库；网络新数据（非兜底）首次同步后持久化。
          if (!isCacheFallback(payload)) {
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
      );
      const toBundle = (snapshot: ScoreSnapshot): GameDataBundle => ({
        gameId: 'maimai',
        providerId: activeProviderId,
        profile: getGameProfile('maimai'),
        payload: maimaiPayloadFromSnapshot(snapshot, getGameProfile('maimai')),
      });
      // 缓存优先：先渲染 SQLite 快照，后台刷新成功后静默回写。
      // 与 useScoreSnapshot 并发时由 ScoreService 的 in-flight 去重共享一次网络请求。
      // local/maimai-test 账号同样启用：首屏不再等待曲库网络拉取。
      if (persistScores) {
        const cached = await repository.getLatest(activeAccountId);
        if (cached) {
          void service.load().then((fresh) => {
            if (fresh.source.kind !== 'cache') queryClient.setQueryData(queryKey, toBundle(fresh));
          }).catch(() => undefined);
          // 本地账号数据本身来自本地快照，不打过期标。
          return toBundle(activeProviderId === 'local' ? cached : staleCachedSnapshot(cached));
        }
      }
      const snapshot = await service.load();
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
      updateBoundAccountScore(
        activeAccountId,
        d.payload.playerScore.display,
        d.payload.player.name,
        d.payload.player.avatarUrl ?? d.payload.player.avatar ?? undefined,
      );
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
        : (query.data.payload.kind === 'maimai' || query.data.payload.kind === 'phigros')
          && (query.data.payload.source.isStale || query.data.payload.catalogSource.isStale)
    ),
  };
}
