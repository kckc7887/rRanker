import { loadRizlineCached, loadRizlineWithFallback } from '@/services/rizline-service';
import { ensureRizlineCatalog, RIZLINE_CATALOG_QUERY_KEY } from '@/hooks/use-rizline-catalog';
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
  gameDataBundle,
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
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ProviderError } from '@/providers/errors';
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
import type { PhiraBestSnapshot, PhiraPlayerSnapshot } from '@/domain/phira';
import { phiraBestsEntityKey, phiraPlayerEntityKey } from '@/hooks/use-phira';
import {
  ensureMuseDashAlbums,
  ensureMuseDashDiffdiff,
  museDashPlayerEntityKey,
} from '@/hooks/use-muse-dash';
import { tufPlayerEntityKey } from '@/hooks/use-tuf';
import { ensureMaimaiCatalog } from '@/hooks/use-detailed-catalog';
import { ensureChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { ensurePhigrosCatalog } from '@/hooks/use-phigros-catalog';

const repository = new SqliteSnapshotRepository();
const tufCache = new TufCache();
const museDashCache = new MuseDashCache();
const osuCache = new OsuCache();
/** Phigros 曲库 Provider：曲库与章节只保留在会话内，本模块保留一个实例复用发布资源会话。 */
const phigrosCatalogProvider = new PhigrosCatalogProvider();

/**
 * 一次实体加载的结果：首屏数据包 + 可选的后台刷新终态句柄。
 * 加载器只负责读取与装配；发布职责属于查询适配层，加载器通过上下文端口写入缓存。
 */
export type GameDataLoadResult = {
  bundle: GameDataBundle;
  /** 缓存优先路径分离出的后台刷新终态；没有分离刷新时为 undefined。 */
  background?: Promise<GameDataRefreshResult>;
};

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
  /** 唯一发布入口：把该实体的数据包写入查询缓存。 */
  publish: (bundle: GameDataBundle) => void;
  /** 读取另一个实体已提交的版本（不做网络请求）。 */
  readEntityValue: <T>(entityKey: readonly unknown[]) => T | undefined;
  /** 写入另一个实体（曲库、最佳成绩等）的已提交版本。 */
  publishEntityValue: <T>(entityKey: readonly unknown[], value: T) => void;
  /** 失效另一个粒度的实体（如排名）。 */
  invalidateEntityValue: (entityKey: readonly unknown[]) => void;
};

export type GameDataLoader = (context: GameDataLoaderContext) => Promise<GameDataLoadResult>;

async function loadRizlineGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, profile, hasSessionData, session, signal, assertCurrent, publish, readEntityValue } = context;
  const catalog = await ensureRizlineCatalog().catch(() => undefined);
  assertCurrent();
  const toBundle = (snapshot: RizlineSnapshot): GameDataBundle => gameDataBundle({
    gameId: 'rizline', providerId: 'rizline-official', profile,
    payload: rizlinePayloadFromSnapshot(snapshot, readEntityValue<RizlineCatalogData>(RIZLINE_CATALOG_QUERY_KEY) ?? catalog),
  });
  if (session?.mode !== 'rizline') {
    const cached = await loadRizlineCached(activeAccountId);
    assertCurrent();
    return { bundle: cached ? toBundle({ ...staleCached(cached), requiresLogin: true }) : gameDataBundle({
      gameId: 'rizline', providerId: context.activeProviderId, profile,
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
    onFallback: value => { if (value.requiresLogin) publish(toBundle(value)); },
  });
  assertCurrent();
  return { bundle: toBundle(load.value), background: gameDataBackground(load.background, toBundle) };
}

async function loadMajdataGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, profile, hasSessionData, session, signal, assertCurrent, publish, invalidateEntityValue } = context;
  const toBundle = (snapshot: MajdataSnapshot): GameDataBundle => gameDataBundle({ gameId: 'majdata-net', providerId: 'majdata-net', profile,
    payload: { kind: 'majdata-net', snapshot, source: snapshot.source,
      playerScore: { label: 'DX · Classic', value: majdataTotal(snapshot.records), display: majdataTotalText(snapshot) } } });
  if (session?.mode !== 'http-cookies') {
    const cached = await loadMajdataCached(activeAccountId);
    if (cached) return { bundle: toBundle(staleCached(cached)) };
    return { bundle: gameDataBundle({ gameId: 'majdata-net', providerId: context.activeProviderId, profile,
      payload: emptyGamePayload('majdata-net', '请重新登录 Majdata Net') }) };
  }
  const fresh = async (requestSignal: AbortSignal) => {
    try { const result = await loadMajdataFresh(activeAccountId, session, requestSignal);
      // 新成绩落定后排名实体过期：失效经适配层端口，加载器不再直接操作查询客户端。
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
    return { bundle: gameDataBundle({ gameId: 'phira', providerId: null, profile: getGameProfile('phira'), payload: emptyGamePayload('phira', '未绑定 Phira 玩家') }) };
  }
  const phiraProfile = getGameProfile('phira');
  const playerKey = phiraPlayerEntityKey(playerId);
  const bestsKey = phiraBestsEntityKey(playerId);
  const toBundle = async (snapshot: PhiraPlayerSnapshot): Promise<GameDataBundle> => gameDataBundle({
    gameId: 'phira', providerId: 'phira-community', profile: phiraProfile,
    payload: { kind: 'phira', snapshot,
      // 最佳成绩是另一个粒度：已提交版本优先，避免总览与页面各读一份。
      bests: readEntityValue<PhiraBestSnapshot>(bestsKey) ?? await phiraCache.loadBests(playerId),
      playerScore: { label: 'Ranking Score', value: snapshot.player.rks, display: snapshot.player.rks.toFixed(phiraProfile.ratingDigits) }, source: snapshot.source },
  });
  // 玩家实体是唯一版本来源：页面已加载时直接复用它，只有真正取回新数据才写回实体键。
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
    return { bundle: gameDataBundle({
      gameId: 'adofai', providerId: null, profile: getGameProfile('adofai'),
      payload: emptyGamePayload('adofai', '未绑定 TUF 玩家'),
    }) };
  }
  const toBundle = (player: TufPlayer, source: DataSource): GameDataBundle => gameDataBundle({
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
  // 玩家实体是唯一版本来源：页面已加载时复用同一版本，不再另开一份读取。
  const playerKey = tufPlayerEntityKey(playerId);
  const committed = hasSessionData ? undefined : readEntityValue<TufPlayer>(playerKey);
  const stored = committed === undefined && !hasSessionData ? await tufCache.loadPlayer(playerId) : null;
  const fetchedFresh = committed === undefined && stored === null;
  const snapshot = committed !== undefined
    ? makeTufSnapshot(committed)
    : stored
      ? staleCached(stored)
      : makeTufSnapshot(await loadTufPlayerFresh(playerId, signal));
  if (fetchedFresh) {
    assertCurrent();
    publishEntityValue(playerKey, snapshot.data);
    if (!signal.aborted) void tufCache.savePlayer(playerId, snapshot, assertCurrent).catch(() => undefined);
  }
  return { bundle: toBundle(snapshot.data, snapshot.source) };
}

async function loadMuseDashGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, activeAccount, signal, assertCurrent, hasSessionData, readEntityValue, publishEntityValue } = context;
  const userId = museDashUserIdFromAccountId(activeAccountId);
  if (activeProviderId === 'musedash-test' && userId !== null && isMuseDashTestUserId(userId)) {
    const toBundle = (player: MuseDashPlayer, source: DataSource): GameDataBundle => gameDataBundle({
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
    return { bundle: toBundle(snapshot.data, snapshot.source) };
  }
  if (activeProviderId !== 'musedash-moe' || userId === null) {
    return { bundle: gameDataBundle({
      gameId: 'musedash', providerId: null, profile: getGameProfile('musedash'),
      payload: emptyGamePayload('musedash', '未绑定喵斯快跑玩家'),
    }) };
  }
  const toBundle = (player: MuseDashPlayer, source: DataSource): GameDataBundle => gameDataBundle({
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
  // 玩家实体是唯一版本来源：随机歌曲页与总览共用同一份已提交版本。
  const playerKey = museDashPlayerEntityKey(userId);
  const committed = hasSessionData ? undefined : readEntityValue<{ data: MuseDashPlayer; source: DataSource }>(playerKey);
  const stored = committed === undefined && !hasSessionData ? await museDashCache.loadPlayer(userId) : null;
  const fetchedFresh = committed === undefined && stored === null;
  const snapshot = committed ?? (stored ? staleCached(stored) : makeMuseDashSnapshot(await loadMuseDashPlayerFresh(userId, signal)));
  if (fetchedFresh) {
    assertCurrent();
    publishEntityValue(playerKey, snapshot);
    if (!signal.aborted) void museDashCache.savePlayer(userId, snapshot, assertCurrent).catch(() => undefined);
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
      return gameDataBundle({
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
    // 示例账号仍由真实公开曲库生成，但公开曲库只保留在本次 React Query 会话。
    return { bundle: toBundle(await ensureChunithmCatalog()) };
  }
  if (activeProviderId === 'lxns' && session?.mode === 'lxns-oauth') {
    const provider = new ChunithmScoreProvider(
      session,
      (update) => applyLxnsTokenRotation(activeAccountId, update),
    );
    const service = new ChunithmPersonalService(
      provider,
      repository,
      activeAccountId,
    );
    const toBundle = (snapshot: ChunithmPersonalSnapshot): GameDataBundle => gameDataBundle({
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
    // 一次刷新按 player/scores/bests 分项提交：整批完成才推进抓取时间，
    // 部分成功保留成功项与失败项，返回的快照带过期标记而不是伪装成本次成功。
    const result = await service.refresh(signal);
    if (result.status === 'cancelled') throw signal.reason ?? new Error('中二个人成绩刷新已取消');
    if (!result.value) {
      const failure = result.failures[0];
      throw failure
        ? new ProviderError(failure.code, failure.diagnostic, failure.retryable)
        : new Error('中二个人成绩读取失败');
    }
    return { bundle: toBundle(result.value) };
  }
  return { bundle: gameDataBundle({
    gameId: 'chunithm',
    providerId: activeProviderId,
    profile: getGameProfile('chunithm'),
    payload: emptyGamePayload('chunithm', '临时账号'),
  }) };
}

async function loadOsuGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, session, signal, assertCurrent, hasSessionData } = context;
  const activeGameId = context.activeGameId;
  if (!isOsuGameId(activeGameId)) throw new Error('osu 加载器收到非 osu 游戏');
  const userId = osuUserIdFromAccountId(activeAccountId);
  if (activeProviderId === 'osu' && session?.mode === 'osu-oauth' && userId !== null) {
    const provider = new OsuScoreProvider(
      session,
      (next, expected) => applyOsuTokenRotation(activeAccountId, next, expected),
    );
    const toBundle = (snapshot: OsuSnapshot): GameDataBundle => gameDataBundle({
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
    return { bundle: toBundle(snapshot) };
  }
  return { bundle: gameDataBundle({
    gameId: activeGameId,
    providerId: activeProviderId,
    profile: getGameProfile(activeGameId),
    payload: emptyGamePayload(activeGameId, '未绑定 osu! 账号'),
  }) };
}

async function loadTestGameDataBundle(): Promise<GameDataLoadResult> {
  return { bundle: gameDataBundle({
    gameId: 'test',
    providerId: null,
    profile: getGameProfile('test'),
    payload: emptyGamePayload('test', '测试游戏'),
  }) };
}

async function loadPhigrosGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeAccount, scoreProvider, signal, assertCurrent, hasSessionData } = context;
  if (scoreProvider instanceof MaxedPhigrosTestProvider) {
    const catalog = (await ensurePhigrosCatalog(phigrosCatalogProvider)).snapshot;
    const snapshot = buildMaxedPhigrosSnapshot(
      catalog,
      activeAccount?.displayName ?? '示例账号',
    );
    return { bundle: gameDataBundle({
      gameId: 'phigros',
      providerId: 'phigros-test',
      profile: getGameProfile('phigros'),
      payload: phigrosPayloadFromSnapshot(snapshot, catalog.source),
    }) };
  }
  if (scoreProvider instanceof PhigrosScoreProvider) {
    const payload = await loadPhigrosGameData({
      accountId: activeAccountId, scoreProvider, catalogProvider: phigrosCatalogProvider,
      cache: new PhigrosSaveCache(repository), hasSessionData, signal, assertCurrent,
    });
    return { bundle: gameDataBundle({
      gameId: 'phigros', providerId: 'phi-taptap', profile: getGameProfile('phigros'), payload,
    }) };
  }

  return { bundle: gameDataBundle({
    gameId: 'phigros',
    providerId: null,
    profile: getGameProfile('phigros'),
    payload: emptyGamePayload('phigros', 'Phigros'),
  }) };
}

async function loadMaimaiGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  const { activeAccountId, activeProviderId, activeAccount, scoreProvider, catalogProvider, signal } = context;
  // 无绑定账号 / 未选中查分器：按空数据处理，不走成绩 provider。
  if (!activeProviderId || !activeAccountId || activeAccountId === UNBOUND_ACCOUNT_ID) {
    return { bundle: gameDataBundle({
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
    return { bundle: gameDataBundle({
      gameId: 'maimai',
      providerId: 'lxns',
      profile: getGameProfile('maimai'),
      payload: emptyGamePayload('maimai', activeAccount.displayName),
    }) };
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
  const toBundle = (snapshot: ScoreSnapshot): GameDataBundle => gameDataBundle({
    gameId: 'maimai',
    providerId: activeProviderId,
    profile: getGameProfile('maimai'),
    payload: maimaiPayloadFromSnapshot(snapshot, getGameProfile('maimai')),
  });
  // 首次进入优先复用本地快照；已有会话数据后的显式 refetch 才读取网络。
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

/**
 * 每个游戏 id 的必需加载器：穷尽映射，遗漏任一游戏（含 osu! 四模式与保留测试 id）即编译失败，
 * 不再用 `Partial` 注册表加默认舞萌分支。
 */
export const GAME_DATA_LOADERS: Record<GameId, GameDataLoader> = {
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
  test: loadTestGameDataBundle,
};

export function selectGameDataLoader(gameId: GameId): GameDataLoader {
  const loader: GameDataLoader | undefined = GAME_DATA_LOADERS[gameId];
  if (!loader) throw new Error(`未登记游戏数据加载器：${gameId}`);
  return loader;
}

export function loadGameDataBundle(context: GameDataLoaderContext): Promise<GameDataLoadResult> {
  return selectGameDataLoader(context.activeGameId)(context);
}
