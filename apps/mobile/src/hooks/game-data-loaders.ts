import { loadRizlineCached, loadRizlineWithFallback } from '@/services/rizline-service';
import { ensureRizlineCatalog, RIZLINE_CATALOG_QUERY_KEY } from '@/hooks/use-rizline-catalog';
import type { RizlineCatalogData } from '@/domain/rizline';
import { loadMajdataCached, loadMajdataFresh } from '@/services/majdata-service';
import { majdataTotalText, majdataTotal, type MajdataSnapshot } from '@/domain/majdata';
import { cacheFirstLoad, staleCached } from '@/services/cache-first';
import { loadPhigrosGameData } from '@/services/phigros-game-data-service';
import {
  emptyGamePayload,
  maimaiPayloadFromSnapshot,
  osuPayloadFromSnapshot,
  phigrosPayloadFromSnapshot,
  rizlinePayloadFromSnapshot,
  type GameDataBundle,
} from '@/domain/game-data';
import { getGameProfile, type GameProfile } from '@/domain/game-profile';
import type { BoundAccount } from '@/domain/bound-account';
import type { GameId, ProviderId } from '@/domain/game-bind-options';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import { ScoreService, staleCachedSnapshot } from '@/services/score-service';
import { queryClient } from '@/state/query-client';
import type { ScoreSnapshot, DataSource } from '@/domain/models';
import type { ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import {
  applyLxnsTokenRotation,
  applyOsuTokenRotation,
  UNBOUND_ACCOUNT_ID,
} from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistMaimaiCatalog, shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { PhigrosSaveCache } from '@/services/phigros-save-cache';
import type { gameDataQueryKey } from '@/services/game-data-query';
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
import { type TufPlayer } from '@/domain/tuf';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import { buildMaxedChunithmSnapshot } from '@/providers/maxed-chunithm-test-provider';
import {
  buildMaxedPhigrosSnapshot,
  MaxedPhigrosTestProvider,
} from '@/providers/maxed-phigros-test-provider';
import { maxedMuseDashPlayerSnapshot } from '@/providers/maxed-musedash-test-provider';
import { phiraCache } from '@/services/phira-cache';
import { loadPhiraPlayerFresh, refreshPhiraSeedBests } from '@/services/phira-service';
import { ensureMaimaiCatalog } from '@/hooks/use-detailed-catalog';
import { ensureChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { ensureMuseDashAlbums, ensureMuseDashDiffdiff } from '@/hooks/use-muse-dash';
import { ensurePhigrosCatalog } from '@/hooks/use-phigros-catalog';

const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();
const museDashCache = new MuseDashCache();
const osuCache = new OsuCache();

export type GameDataLoaderContext = {
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  activeAccountId: string;
  session: ProviderSession | null;
  scoreProvider: AnyScoreProvider;
  catalogProvider: DetailedCatalogProvider;
  activeAccount: BoundAccount | undefined;
  profile: GameProfile;
  queryKey: ReturnType<typeof gameDataQueryKey>;
  hasSessionData: boolean;
  signal: AbortSignal;
  assertCurrent: () => void;
};

export type GameDataLoader = (context: GameDataLoaderContext) => Promise<GameDataBundle>;

async function loadRizlineGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, profile, queryKey, hasSessionData, session, signal, assertCurrent } = context;
  const catalog = await ensureRizlineCatalog().catch(() => undefined);
  assertCurrent();
  const toBundle = (snapshot: import('@/domain/rizline').RizlineSnapshot): GameDataBundle => ({
    gameId: 'rizline', providerId: 'rizline-official', profile,
    payload: rizlinePayloadFromSnapshot(snapshot, queryClient.getQueryData<RizlineCatalogData>(RIZLINE_CATALOG_QUERY_KEY) ?? catalog),
  });
  if (session?.mode !== 'rizline') {
    const cached = await loadRizlineCached(activeAccountId);
    assertCurrent();
    return cached ? toBundle({ ...staleCached(cached), requiresLogin: true }) : { gameId: context.activeGameId, providerId: context.activeProviderId, profile,
      payload: emptyGamePayload(context.activeGameId, '请登录 Rizline 官方账号') };
  }
  const fresh = (requestSignal: AbortSignal) => loadRizlineWithFallback(activeAccountId, session, requestSignal);
  const snapshot = hasSessionData ? await fresh(signal) : await cacheFirstLoad({
    loadCached: () => loadRizlineCached(activeAccountId), loadFresh: fresh, signal, assertCurrent,
    onFresh: value => queryClient.setQueryData(queryKey, toBundle(value)),
    onFallback: value => { if (value.requiresLogin) queryClient.setQueryData(queryKey, toBundle(value)); },
  });
  assertCurrent();
  return toBundle(snapshot);
}

async function loadMajdataGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, profile, queryKey, hasSessionData, session, signal, assertCurrent } = context;
  const toBundle = (snapshot: MajdataSnapshot): GameDataBundle => ({ gameId: 'majdata-net', providerId: 'majdata-net', profile,
    payload: { kind: 'majdata-net', snapshot, source: snapshot.source,
      playerScore: { label: 'DX · Classic', value: majdataTotal(snapshot.records), display: majdataTotalText(snapshot) } } });
  if (session?.mode !== 'http-cookies') {
    const cached = await loadMajdataCached(activeAccountId);
    if (cached) return toBundle(staleCached(cached));
    return { gameId: context.activeGameId, providerId: context.activeProviderId, profile, payload: emptyGamePayload(context.activeGameId, '请重新登录 Majdata Net') };
  }
  const fresh = async (requestSignal: AbortSignal) => {
    try { const result = await loadMajdataFresh(activeAccountId, session, requestSignal);
      void queryClient.invalidateQueries({ queryKey: ['majdata-net', 'ranking', activeAccountId] });
      return result; }
    catch (error) { const cached = await loadMajdataCached(activeAccountId); if (cached && !requestSignal.aborted) return staleCached(cached); throw error; }
  };
  const snapshot = hasSessionData ? await fresh(signal) : await cacheFirstLoad({
    loadCached: () => loadMajdataCached(activeAccountId), loadFresh: fresh, signal,
    assertCurrent,
    onFresh: value => queryClient.setQueryData(queryKey, toBundle(value)),
  });
  return toBundle(snapshot);
}

async function loadPhiraGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeProviderId, signal, assertCurrent, queryKey, hasSessionData } = context;
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
        assertCurrent();
        queryClient.setQueryData(queryKey, bundle);
      }).catch(() => undefined);
  }
  return toBundle(snapshot);
}

async function loadAdofaiGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeProviderId, signal, assertCurrent, hasSessionData } = context;
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
  if (!stored && !signal.aborted) void tufCache.savePlayer(playerId, snapshot, assertCurrent).catch(() => undefined);
  return toBundle(snapshot.data, snapshot.source);
}

async function loadMuseDashGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeProviderId, activeAccount, signal, assertCurrent, hasSessionData } = context;
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
  if (!stored && !signal.aborted) void museDashCache.savePlayer(userId, snapshot, assertCurrent).catch(() => undefined);
  return toBundle(snapshot.data, snapshot.source);
}

async function loadChunithmGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeProviderId, activeAccount, session, signal, hasSessionData } = context;
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

async function loadOsuGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeProviderId, session, signal, assertCurrent, hasSessionData } = context;
  const activeGameId = context.activeGameId;
  if (!isOsuGameId(activeGameId)) throw new Error('osu 加载器收到非 osu 游戏');
  const userId = osuUserIdFromAccountId(activeAccountId);
  if (activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null) {
    const provider = new OsuScoreProvider(
      session,
      (next, expected) => applyOsuTokenRotation(activeAccountId, next, expected),
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
    if (!stored && !signal.aborted) void osuCache.save(activeGameId, userId, snapshot, assertCurrent).catch(() => undefined);
    return toBundle(snapshot);
  }
  return {
    gameId: activeGameId,
    providerId: activeProviderId,
    profile: getGameProfile(activeGameId),
    payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号'),
  };
}

async function loadTestGameDataBundle(): Promise<GameDataBundle> {
  return {
    gameId: 'test',
    providerId: null,
    profile: getGameProfile('test'),
    payload: emptyGamePayload('test', '测试游戏'),
  };
}

async function loadPhigrosGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeAccount, scoreProvider, catalogProvider, signal, assertCurrent, hasSessionData } = context;
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
      payload: phigrosPayloadFromSnapshot(snapshot, catalog.source),
    };
  }
  if (scoreProvider instanceof PhigrosScoreProvider) {
    const phiCatalog = catalogProvider instanceof PhigrosCatalogProvider
      ? catalogProvider
      : new PhigrosCatalogProvider();
    const payload = await loadPhigrosGameData({
      accountId: activeAccountId, scoreProvider, catalogProvider: phiCatalog,
      cache: new PhigrosSaveCache(repository), hasSessionData, signal, assertCurrent,
    });
    return {
      gameId: 'phigros', providerId: 'phi-taptap', profile: getGameProfile('phigros'), payload,
    };
  }

  return {
    gameId: 'phigros' as const,
    providerId: null,
    profile: getGameProfile('phigros'),
    payload: emptyGamePayload('phigros', 'Phigros'),
  };
}

async function loadMaimaiGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  const { activeAccountId, activeProviderId, activeAccount, scoreProvider, catalogProvider, signal } = context;
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
  if (persistScores && !context.hasSessionData) {
    const cached = await repository.getLatest(activeAccountId);
    if (cached) {
      if (activeProviderId !== 'local') return toBundle(staleCachedSnapshot(cached));
      const displayName = activeAccount?.displayName ?? cached.player.displayName;
      return toBundle({
        ...cached,
        player: { ...cached.player, displayName },
        best50: { ...cached.best50, player: { ...cached.best50.player, displayName } },
      });
    }
  }
  const snapshot = await service.load(signal);
  return toBundle(snapshot);
}

const GAME_DATA_LOADERS: Partial<Record<GameId, GameDataLoader>> = {
  rizline: loadRizlineGameDataBundle,
  'majdata-net': loadMajdataGameDataBundle,
  phira: loadPhiraGameDataBundle,
  adofai: loadAdofaiGameDataBundle,
  musedash: loadMuseDashGameDataBundle,
  chunithm: loadChunithmGameDataBundle,
  test: loadTestGameDataBundle,
  phigros: loadPhigrosGameDataBundle,
};

export function selectGameDataLoader(gameId: GameId): GameDataLoader {
  if (isOsuGameId(gameId)) return loadOsuGameDataBundle;
  return GAME_DATA_LOADERS[gameId] ?? loadMaimaiGameDataBundle;
}

export function loadGameDataBundle(context: GameDataLoaderContext): Promise<GameDataBundle> {
  return selectGameDataLoader(context.activeGameId)(context);
}
