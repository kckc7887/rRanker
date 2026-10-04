import type { GameDataCatalogQueries } from './game-data-loader-queries';
import { loadRizlineCached, loadRizlineWithFallback } from '@/services/rizline-service';
import { RIZLINE_CATALOG_QUERY_KEY } from '@/services/rizline-catalog-query';
import type { RizlineCatalogData, RizlineSnapshot } from '@/domain/rizline';
import { loadMajdataCached, loadMajdataFresh } from '@/services/majdata-service';
import { majdataTotalText, majdataTotal, type MajdataSnapshot } from '@/domain/majdata';
import { cacheFirstLoadWithBackground, staleCached } from '@/services/cache-first';
import {
  gameDataBackground,
  type GameDataRefreshResult,
  type gameDataQueryKey,
} from '@/services/game-data-query';
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
import { isProviderForGame, type GameId, type ProviderId } from '@/domain/game-bind-options';
import type { AnyScoreProvider, DetailedCatalogProvider, ProviderSession } from '@/providers/contracts';
import { ScoreService, staleCachedSnapshot } from '@/services/score-service';
import type { ScoreSnapshot, DataSource } from '@/domain/models';
import type { ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import {
  UNBOUND_ACCOUNT_ID,
} from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { shouldPersistScoreSnapshot } from '@/domain/provider-capabilities';
import { sharedProvider as phigrosCatalogProvider } from './phigros-catalog-query';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { PhigrosSaveCache } from '@/services/phigros-save-cache';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ProviderError } from '@/providers/errors';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
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
import { type TufPlayer, type TufPlayerSnapshot } from '@/domain/tuf';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import { buildMaxedChunithmSnapshot } from '@/providers/maxed-chunithm-test-provider';
import {
  buildMaxedPhigrosSnapshot,
  MaxedPhigrosTestProvider,
} from '@/providers/maxed-phigros-test-provider';
import { maxedMuseDashPlayerSnapshot } from '@/providers/maxed-musedash-test-provider';
import { phiraCache } from '@/services/phira-cache';
import { loadPhiraPlayerFresh, refreshPhiraSeedBests } from '@/services/phira-service';
import type { PhiraBestSnapshot, PhiraPlayerSnapshot } from '@/domain/phira';
import { phiraBestsEntityKey, phiraPlayerEntityKey } from '@/services/phira-query';
import { museDashPlayerEntityKey } from '@/services/muse-dash-query';
import { tufPlayerEntityKey } from '@/services/tuf-query';

const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();
const museDashCache = new MuseDashCache();
const osuCache = new OsuCache();

export type GameDataLoadResult = {
  bundle: GameDataBundle;
  background?: Promise<GameDataRefreshResult>;
};

export type GameDataLoaderContext = {
  activeGameId: GameId;
  activeProviderId: ProviderId | null;
  activeAccountId: string;
  session: ProviderSession | null;
  scoreProvider: AnyScoreProvider;
  protocolScoreProvider: ChunithmScoreProvider | OsuScoreProvider | null;
  catalogQueries: GameDataCatalogQueries;
  catalogProvider: DetailedCatalogProvider | null;
  activeAccount: BoundAccount | undefined;
  profile: GameProfile;
  queryKey: ReturnType<typeof gameDataQueryKey>;
  hasSessionData: boolean;
  signal: AbortSignal;
  assertCurrent: () => void;
  publish: (bundle: GameDataBundle) => void | Promise<void>;
  readEntityValue: <T>(entityKey: readonly unknown[]) => T | undefined;
  publishEntityValue: <T>(entityKey: readonly unknown[], value: T) => void;
  invalidateEntityValue: (entityKey: readonly unknown[]) => void;
};

export type GameDataLoader = (context: GameDataLoaderContext) => Promise<GameDataLoadResult>;

async function loadRizlineGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, hasSessionData, session, signal, assertCurrent, publish, readEntityValue } = context;
  const profile = getGameProfile('rizline');
  const catalog = await context.catalogQueries.rizline().catch(() => undefined);
  assertCurrent();
  const toBundle = (snapshot: RizlineSnapshot): GameDataBundle => ({
    gameId: 'rizline', providerId: 'rizline-official', profile,
    payload: rizlinePayloadFromSnapshot(snapshot, readEntityValue<RizlineCatalogData>(RIZLINE_CATALOG_QUERY_KEY) ?? catalog),
  });
  if (session?.mode !== 'rizline') {
    const cached = await loadRizlineCached(activeAccountId);
    assertCurrent();
    return { bundle: cached ? toBundle({ ...staleCached(cached), requiresLogin: true }) : ({
      gameId: 'rizline', providerId: context.activeProviderId !== null && isProviderForGame('rizline', context.activeProviderId) ? context.activeProviderId : null, profile,
      payload: emptyGamePayload('rizline', '请登录 Rizline 官方账号') }) };
  }
  const fresh = (requestSignal: AbortSignal) => loadRizlineWithFallback(activeAccountId, session, requestSignal);
  if (hasSessionData) {
    const snapshot = await fresh(signal);
    assertCurrent();
    return { bundle: toBundle(snapshot) };
  }
  const load = await cacheFirstLoadWithBackground({
    loadCached: () => loadRizlineCached(activeAccountId), loadFresh: fresh, signal, assertCurrent,
    onFresh: value => publish(toBundle(value)),
    onFallback: value => { if (value.requiresLogin) return publish(toBundle(value)); },
  });
  assertCurrent();
  return { bundle: toBundle(load.value), background: gameDataBackground(load.background, toBundle) };
}

async function loadMajdataGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, hasSessionData, session, signal, assertCurrent, publish, invalidateEntityValue } = context;
  const profile = getGameProfile('majdata-net');
  const toBundle = (snapshot: MajdataSnapshot): GameDataBundle => ({ gameId: 'majdata-net', providerId: 'majdata-net', profile,
    payload: { kind: 'majdata-net', snapshot, source: snapshot.source,
      playerScore: { label: 'DX · Classic', value: majdataTotal(snapshot.records), display: majdataTotalText(snapshot) } } });
  if (session?.mode !== 'http-cookies') {
    const cached = await loadMajdataCached(activeAccountId);
    if (cached) return { bundle: toBundle(staleCached(cached)) };
    return { bundle: ({ gameId: 'majdata-net', providerId: context.activeProviderId !== null && isProviderForGame('majdata-net', context.activeProviderId) ? context.activeProviderId : null, profile,
      payload: emptyGamePayload('majdata-net', '请重新登录 Majdata Net') }) };
  }
  const fresh = async (requestSignal: AbortSignal) => {
    try { const result = await loadMajdataFresh(activeAccountId, session, requestSignal);
      invalidateEntityValue(['majdata-net', 'ranking', activeAccountId]);
      return result; }
    catch (error) { const cached = await loadMajdataCached(activeAccountId); if (cached && !requestSignal.aborted) return staleCached(cached); throw error; }
  };
  if (hasSessionData) {
    const snapshot = await fresh(signal);
    assertCurrent();
    return { bundle: toBundle(snapshot) };
  }
  const load = await cacheFirstLoadWithBackground({
    loadCached: () => loadMajdataCached(activeAccountId), loadFresh: fresh, signal,
    assertCurrent,
    onFresh: value => publish(toBundle(value)),
  });
  assertCurrent();
  return { bundle: toBundle(load.value), background: gameDataBackground(load.background, toBundle) };
}

async function loadPhiraGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, signal, assertCurrent, hasSessionData, readEntityValue, publishEntityValue } = context;
  const playerId = phiraPlayerIdFromAccountId(activeAccountId);
  if (activeProviderId !== 'phira-community' || playerId === null) {
    return { bundle: ({ gameId: 'phira', providerId: null, profile: getGameProfile('phira'), payload: emptyGamePayload('phira', '未绑定 Phira 玩家') }) };
  }
  const phiraProfile = getGameProfile('phira');
  const playerKey = phiraPlayerEntityKey(playerId);
  const bestsKey = phiraBestsEntityKey(playerId);
  const toBundle = async (snapshot: PhiraPlayerSnapshot): Promise<GameDataBundle> => ({
    gameId: 'phira', providerId: 'phira-community', profile: phiraProfile,
    payload: { kind: 'phira', snapshot,
      bests: readEntityValue<PhiraBestSnapshot>(bestsKey) ?? await phiraCache.loadBests(playerId),
      playerScore: { label: 'Ranking Score', value: snapshot.player.rks, display: snapshot.player.rks.toFixed(phiraProfile.ratingDigits) }, source: snapshot.source },
  });
  const committed = hasSessionData ? undefined : readEntityValue<PhiraPlayerSnapshot>(playerKey);
  const stored = committed === undefined && !hasSessionData ? await phiraCache.loadPlayer(playerId) : null;
  const fetchedFresh = committed === undefined && stored === null;
  const snapshot = committed ?? (stored ? staleCached(stored) : await loadPhiraPlayerFresh(playerId, signal));
  if (fetchedFresh) {
    assertCurrent();
    publishEntityValue(playerKey, snapshot);
    void refreshPhiraSeedBests(snapshot, signal).then((result) => {
      assertCurrent();
      if (!signal.aborted && result.snapshot) publishEntityValue(bestsKey, result.snapshot);
    }).catch(() => undefined);
  }
  return { bundle: await toBundle(snapshot) };
}

async function loadAdofaiGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, signal, assertCurrent, hasSessionData, readEntityValue, publishEntityValue } = context;
  const playerId = tufPlayerIdFromAccountId(activeAccountId);
  if (activeProviderId !== 'tuf' || playerId === null) {
    return { bundle: ({
      gameId: 'adofai', providerId: null, profile: getGameProfile('adofai'),
      payload: emptyGamePayload('adofai', '未绑定 TUF 玩家'),
    }) };
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
  const playerKey = tufPlayerEntityKey(playerId);
  const committed = hasSessionData ? undefined : readEntityValue<TufPlayerSnapshot>(playerKey);
  const stored = committed === undefined && !hasSessionData ? await tufCache.loadPlayer(playerId) : null;
  const fetchedFresh = committed === undefined && stored === null;
  const snapshot = committed !== undefined
    ? committed
    : stored
      ? staleCached(stored)
      : makeTufSnapshot(await loadTufPlayerFresh(playerId, signal));
  if (fetchedFresh) {
    assertCurrent();
    publishEntityValue(playerKey, snapshot);
    if (!signal.aborted) void tufCache.savePlayer(playerId, snapshot, assertCurrent).catch(error =>
      recordRuntimeDiagnostic('operation', { source: 'game-data', gameType: 'adofai', phase: 'cache-persist', result: signal.aborted ? 'cancelled' : 'failed', error }));
  }
  return { bundle: toBundle(snapshot.data, snapshot.source) };
}

async function loadMuseDashGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, activeAccount, signal, assertCurrent, hasSessionData, readEntityValue, publishEntityValue } = context;
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
    const [albums, diffdiff] = await Promise.all([
      context.catalogQueries.museDashAlbums(),
      context.catalogQueries.museDashDiffdiff(),
    ]);
    const snapshot = maxedMuseDashPlayerSnapshot(
      albums.data,
      diffdiff.data,
      activeAccount?.displayName ?? '示例账号',
    );
    return { bundle: toBundle(snapshot.data, snapshot.source) };
  }
  if (activeProviderId !== 'musedash-moe' || userId === null) {
    return { bundle: ({
      gameId: 'musedash', providerId: null, profile: getGameProfile('musedash'),
      payload: emptyGamePayload('musedash', '未绑定喵斯快跑玩家'),
    }) };
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
  const playerKey = museDashPlayerEntityKey(userId);
  const committed = hasSessionData ? undefined : readEntityValue<{ data: MuseDashPlayer; source: DataSource }>(playerKey);
  const stored = committed === undefined && !hasSessionData ? await museDashCache.loadPlayer(userId) : null;
  const fetchedFresh = committed === undefined && stored === null;
  const snapshot = committed ?? (stored ? staleCached(stored) : makeMuseDashSnapshot(await loadMuseDashPlayerFresh(userId, signal)));
  if (fetchedFresh) {
    assertCurrent();
    publishEntityValue(playerKey, snapshot);
    if (!signal.aborted) void museDashCache.savePlayer(userId, snapshot, assertCurrent).catch(error =>
      recordRuntimeDiagnostic('operation', { source: 'game-data', gameType: 'musedash', phase: 'cache-persist', result: signal.aborted ? 'cancelled' : 'failed', error }));
  }
  return { bundle: toBundle(snapshot.data, snapshot.source) };
}

async function loadChunithmGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, activeAccount, session, signal, hasSessionData } = context;
  if (activeProviderId === 'chunithm-test') {
    const toBundle = (catalog: ChunithmCatalogSnapshot): GameDataBundle => {
      const snapshot = buildMaxedChunithmSnapshot(
        catalog,
        activeAccount?.displayName ?? '示例账号',
      );
      return ({
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
      });
    };
    return { bundle: toBundle(await context.catalogQueries.chunithm()) };
  }
  if (activeProviderId === 'lxns' && session?.mode === 'lxns-oauth' && context.protocolScoreProvider instanceof ChunithmScoreProvider) {
    const provider = context.protocolScoreProvider;
    const service = new ChunithmPersonalService(
      provider,
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
    if (cached) return { bundle: toBundle(cached) };
    const result = await service.refresh(signal);
    if (result.status === 'cancelled') throw signal.reason ?? new Error('中二个人成绩刷新已取消');
    if (!result.value) {
      const failure = result.failures[0];
      throw failure
        ? new ProviderError(failure.code, failure.diagnostic, failure.retryable)
        : new Error('中二个人成绩读取失败');
    }
    const bundle = toBundle(result.value);
    return { bundle, background: Promise.resolve({ ...result, value: bundle }) };
  }
  return { bundle: ({
    gameId: 'chunithm',
    providerId: activeProviderId !== null && isProviderForGame('chunithm', activeProviderId) ? activeProviderId : null,
    profile: getGameProfile('chunithm'),
    payload: emptyGamePayload('chunithm', '临时账号'),
  }) };
}

async function loadOsuGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, session, signal, assertCurrent, hasSessionData } = context;
  const activeGameId = context.activeGameId;
  if (!isOsuGameId(activeGameId)) throw new Error('osu 加载器收到非 osu 游戏');
  const userId = osuUserIdFromAccountId(activeAccountId);
  if (activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null && context.protocolScoreProvider instanceof OsuScoreProvider) {
    const provider = context.protocolScoreProvider;
    const toBundle = (snapshot: OsuSnapshot): GameDataBundle => {
      switch (activeGameId) {
        case 'osu-standard': return ({ gameId: activeGameId, providerId: 'osu', profile: getGameProfile(activeGameId), payload: osuPayloadFromSnapshot(snapshot, getGameProfile(activeGameId)) });
        case 'osu-mania': return ({ gameId: activeGameId, providerId: 'osu', profile: getGameProfile(activeGameId), payload: osuPayloadFromSnapshot(snapshot, getGameProfile(activeGameId)) });
        case 'osu-catch': return ({ gameId: activeGameId, providerId: 'osu', profile: getGameProfile(activeGameId), payload: osuPayloadFromSnapshot(snapshot, getGameProfile(activeGameId)) });
        case 'osu-taiko': return ({ gameId: activeGameId, providerId: 'osu', profile: getGameProfile(activeGameId), payload: osuPayloadFromSnapshot(snapshot, getGameProfile(activeGameId)) });
      }
    };
    const stored = hasSessionData ? null : await osuCache.load(activeGameId, userId);
    const snapshot = stored
      ? staleCached(stored)
      : await loadOsuSnapshotFresh(provider, activeGameId, userId, signal);
    if (!stored && !signal.aborted) void osuCache.save(activeGameId, userId, snapshot, assertCurrent).catch(error =>
      recordRuntimeDiagnostic('operation', { source: 'game-data', gameType: activeGameId, phase: 'cache-persist', result: signal.aborted ? 'cancelled' : 'failed', error }));
    return { bundle: toBundle(snapshot) };
  }
  switch (activeGameId) {
    case 'osu-standard': return { bundle: ({ gameId: activeGameId, providerId: null, profile: getGameProfile(activeGameId), payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号') }) };
    case 'osu-mania': return { bundle: ({ gameId: activeGameId, providerId: null, profile: getGameProfile(activeGameId), payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号') }) };
    case 'osu-catch': return { bundle: ({ gameId: activeGameId, providerId: null, profile: getGameProfile(activeGameId), payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号') }) };
    case 'osu-taiko': return { bundle: ({ gameId: activeGameId, providerId: null, profile: getGameProfile(activeGameId), payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号') }) };
  }
}

async function loadPhigrosGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeAccount, scoreProvider, signal, assertCurrent, hasSessionData } = context;
  if (scoreProvider instanceof MaxedPhigrosTestProvider) {
    const catalog = (await context.catalogQueries.phigros(phigrosCatalogProvider)).snapshot;
    const snapshot = buildMaxedPhigrosSnapshot(
      catalog,
      activeAccount?.displayName ?? '示例账号',
    );
    return { bundle: ({
      gameId: 'phigros',
      providerId: 'phigros-test',
      profile: getGameProfile('phigros'),
      payload: phigrosPayloadFromSnapshot(snapshot, catalog.source),
    }) };
  }
  if (scoreProvider instanceof PhigrosScoreProvider) {
    const payload = await loadPhigrosGameData({
      accountId: activeAccountId, scoreProvider, catalogProvider: phigrosCatalogProvider,
      cache: new PhigrosSaveCache(), hasSessionData, signal, assertCurrent,
    });
    return { bundle: ({
      gameId: 'phigros', providerId: 'phi-taptap', profile: getGameProfile('phigros'), payload,
    }) };
  }

  return { bundle: ({
    gameId: 'phigros',
    providerId: null,
    profile: getGameProfile('phigros'),
    payload: emptyGamePayload('phigros', 'Phigros'),
  }) };
}

async function loadMaimaiGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, activeAccount, scoreProvider, catalogProvider, signal } = context;
  if (activeProviderId === null || !isProviderForGame('maimai', activeProviderId) || !catalogProvider || !activeAccountId || activeAccountId === UNBOUND_ACCOUNT_ID) {
    return { bundle: ({
      gameId: 'maimai',
      providerId: null,
      profile: getGameProfile('maimai'),
      payload: emptyGamePayload('maimai', '未绑定账号'),
    }) };
  }

  if (activeProviderId === 'lxns'
    && activeAccount?.scoreDisplay === '—'
    && scoreProvider instanceof LxnsScoreProvider
    && await scoreProvider.getOptionalPlayer() === null) {
    return { bundle: ({
      gameId: 'maimai',
      providerId: 'lxns',
      profile: getGameProfile('maimai'),
      payload: emptyGamePayload('maimai', activeAccount.displayName),
    }) };
  }

  const persistScores = shouldPersistScoreSnapshot(activeProviderId);
  const service = new ScoreService(
    scoreProvider,
    catalogProvider,
    activeAccountId,
    persistScores,
    (detailed, catalogSignal) => detailed
      ? catalogProvider.getDetailedCatalog(catalogSignal)
      : context.catalogQueries.maimai(catalogProvider),
  );
  const toBundle = (snapshot: ScoreSnapshot): GameDataBundle => ({
    gameId: 'maimai',
    providerId: activeProviderId,
    profile: getGameProfile('maimai'),
    payload: maimaiPayloadFromSnapshot(snapshot, getGameProfile('maimai')),
  });
  if (persistScores && !context.hasSessionData) {
    const cached = await repository.getLatest(activeAccountId);
    if (cached) {
      if (activeProviderId !== 'local') return { bundle: toBundle(staleCachedSnapshot(cached)) };
      const displayName = activeAccount?.displayName ?? cached.player.displayName;
      return { bundle: toBundle({
        ...cached,
        player: { ...cached.player, displayName },
        best50: { ...cached.best50, player: { ...cached.best50.player, displayName } },
      }) };
    }
  }
  const snapshot = await service.load(signal);
  return { bundle: toBundle(snapshot) };
}

const GAME_DATA_LOADERS: Record<GameId, GameDataLoader> = {
  maimai: loadMaimaiGameDataBundle,
  chunithm: loadChunithmGameDataBundle,
  phigros: loadPhigrosGameDataBundle,
  phira: loadPhiraGameDataBundle,
  adofai: loadAdofaiGameDataBundle,
  musedash: loadMuseDashGameDataBundle,
  'majdata-net': loadMajdataGameDataBundle,
  rizline: loadRizlineGameDataBundle,
  'osu-standard': loadOsuGameDataBundle,
  'osu-mania': loadOsuGameDataBundle,
  'osu-catch': loadOsuGameDataBundle,
  'osu-taiko': loadOsuGameDataBundle,
};

export function loadGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  return GAME_DATA_LOADERS[context.activeGameId](context);
}
