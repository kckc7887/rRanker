import { jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { loadGameDataBundle, type GameDataLoaderContext } from '@/services/game-data-loaders';
import { tufPlayerQueryOptions, tufPlayerEntityKey } from '@/services/tuf-query';
import { museDashPlayerQueryOptions } from '@/services/muse-dash-query';
import { phiraPlayerQueryOptions, phiraPlayerEntityKey } from '@/services/phira-query';
import { gameDataCatalogQueries } from '@/services/game-data-loader-queries';
import { gameDataQueryKey, registerGameDataBackground, refreshGameDataBundle } from '@/services/game-data-query';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmCatalogProvider, mapChunithmCatalog } from '@/providers/chunithm-catalog-provider';
import { emptyChunithmBests } from '@/domain/chunithm-personal';
import { ProviderError } from '@/providers/errors';
import { getGameProfile } from '@/domain/game-profile';
import type { GameId, ProviderId } from '@/domain/game-bind-options';
import type { TufPlayer } from '@/domain/tuf';
import type { MuseDashPlayer } from '@/domain/muse-dash';
import { PhiraUserSchema, PhiraUserStatsSchema, PhiraChartSchema, PhiraRecordSchema } from '@/domain/phira';
import { tufProvider } from '@/providers/tuf-provider';
import { museDashProvider } from '@/providers/muse-dash-provider';
import { phiraProvider } from '@/providers/phira-provider';
import { createCatalogTestAccount, type CatalogTestGameId } from '@/domain/bound-account';
import { applyRizlineCatalog, RIZLINE_CATALOG_QUERY_KEY } from '@/services/rizline-catalog-query';
import { fixtureSource } from '@/fixtures/sanitized';
import { rizlineCatalog, rizlineChart } from './fixtures/rizline';

jest.mock('@/storage/sqlite-snapshot-repository', () => {
  class MemorySnapshotRepository {
    async getResource() { return null; }
    async saveResource() { return undefined; }
    async updateResource() { return undefined; }
    async getLatest() { return null; }
    async clearResources() { return undefined; }
    async listResourceSizes() { return []; }
  }
  return { SqliteSnapshotRepository: MemorySnapshotRepository };
});

const tufPlayer = { id: 25, name: '公开玩家', rankedScore: 1824.52 } as unknown as TufPlayer;
const museDashPlayer = { uid: 'u-1', name: 'SiMOOOOOON', rl: 3.45 } as unknown as MuseDashPlayer;
const PLAYER_ID = 323528;
const chart = (id: number) => PhiraChartSchema.parse({ id, name: `Chart ${id}`, level: 'AT Lv.16', difficulty: 15.2, uploader: 9 });
const record = (id: number, chartId: number) => PhiraRecordSchema.parse({ id, chart: chartId, score: 900_000, accuracy: 0.99, best: true });

function context(input: { gameId: GameId; providerId: ProviderId; accountId: string; client: QueryClient }): GameDataLoaderContext {
  const queryKey = gameDataQueryKey(input.accountId, input.gameId, input.providerId, null);
  backgroundKeys.push(queryKey);
  return {
    activeGameId: input.gameId,
    activeProviderId: input.providerId,
    activeAccountId: input.accountId,
    session: null,
    protocolScoreProvider: null,
    catalogQueries: gameDataCatalogQueries(input.client),
    scoreProvider: {} as GameDataLoaderContext['scoreProvider'],
    catalogProvider: {} as GameDataLoaderContext['catalogProvider'],
    activeAccount: {
      id: input.accountId, gameId: input.gameId, providerId: input.providerId,
      displayName: '玩家', scoreLabel: 'Rating', scoreDisplay: '—', providerTitle: '查分器',
    },
    profile: getGameProfile(input.gameId),
    queryKey,
    hasSessionData: false,
    signal: new AbortController().signal,
    assertCurrent: () => undefined,
    publish: (bundle) => { input.client.setQueryData(queryKey, bundle); },
    readEntityValue: <T,>(key: readonly unknown[]) => input.client.getQueryData<T>(key),
    publishEntityValue: <T,>(key: readonly unknown[], value: T) => { input.client.setQueryData(key, value); },
    invalidateEntityValue: () => undefined,
  };
}

const clients = new Set<QueryClient>();
const backgroundKeys: (readonly unknown[])[] = [];

it('loads and refreshes the example account through the shared game data entry', async () => {
  const client = createClient(); const account = createCatalogTestAccount('example');
  const input = context({ gameId: 'example', providerId: 'example-test', accountId: account.id, client });
  input.activeAccount = account;
  const { bundle } = await loadGameDataBundle(input);
  expect(bundle.payload).toMatchObject({ kind: 'example', displayName: '示例账号', playerScore: { value: 19000 }, source: { kind: 'generated', isStale: false } });
  client.setQueryData(input.queryKey, bundle);
  const result = await refreshGameDataBundle({ client, params: { accountId: account.id, gameId: 'example', providerId: 'example-test', mode: null },
    refetch: async () => ({ data: (await loadGameDataBundle(input)).bundle, isError: false }) });
  expect(result.status).toBe('success');
  expect(result.value?.payload).toMatchObject({ kind: 'example', playerScore: { value: 19000 } });
});
function createClient() { const client = new QueryClient(); clients.add(client); return client; }
beforeEach(() => { jest.restoreAllMocks(); });
afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
  for (const key of backgroundKeys.splice(0)) registerGameDataBackground(key, null);
});

describe('总览与详情读取同一个实体', () => {
  it('TUF 玩家实体在总览加载后立即可被页面读到同一版本，且不重复请求网络', async () => {
    const profileSpy = jest.spyOn(tufProvider, 'getPlayerProfile').mockResolvedValue(tufPlayer);
    const client = createClient();
    const loader = loadGameDataBundle;
    const accountId = 'adofai:tuf:25';

    const result = await loader(context({ gameId: 'adofai', providerId: 'tuf', accountId, client }));
    expect(result.bundle.payload).toMatchObject({ kind: 'adofai', player: { rankedScore: 1824.52 } });

    const entity = await client.ensureQueryData(tufPlayerQueryOptions(client, 25));
    expect(entity.data).toMatchObject({ rankedScore: 1824.52 });

    expect(profileSpy).toHaveBeenCalledTimes(1);
    expect(result.bundle.payload).toMatchObject({ source: { kind: 'tuf', isStale: false } });
  });

  it('Muse Dash 玩家实体在总览加载后立即可被随机歌曲页读到同一版本', async () => {
    const playerSpy = jest.spyOn(museDashProvider, 'getPlayer').mockResolvedValue(museDashPlayer);
    const client = createClient();
    const loader = loadGameDataBundle;
    const accountId = 'musedash:musedash-moe:u-1';

    const result = await loader(context({ gameId: 'musedash', providerId: 'musedash-moe', accountId, client }));
    expect(result.bundle.payload).toMatchObject({ kind: 'musedash', player: { rl: 3.45 }, source: { isStale: false } });

    const entity = await client.ensureQueryData(museDashPlayerQueryOptions(client, 'u-1'));
    expect(entity?.data).toMatchObject({ rl: 3.45 });

    expect(playerSpy).toHaveBeenCalledTimes(1);
  });

  it('Phira 玩家实体在总览加载后立即可被页面读到同一版本', async () => {
    const userSpy = jest.spyOn(phiraProvider, 'getUser').mockResolvedValue(PhiraUserSchema.parse({ id: PLAYER_ID, name: '玩家' }));
    jest.spyOn(phiraProvider, 'getUserStats').mockResolvedValue(PhiraUserStatsSchema.parse({}));
    jest.spyOn(phiraProvider, 'getPool').mockResolvedValue({
      bestPool: [{ record: 10, chart: 1, rks: 12 }], recentPool: [], rks: 12,
    } as never);
    jest.spyOn(phiraProvider, 'getRecent').mockResolvedValue([]);
    jest.spyOn(phiraProvider, 'getChartsByIds').mockImplementation(async (ids) => ids.map(chart));
    jest.spyOn(phiraProvider, 'getRecordsByIds').mockImplementation(async (ids) => ids.map((id) => record(id, Math.floor(id / 10))));
    jest.spyOn(phiraProvider, 'getChartBest').mockResolvedValue([]);
    const client = createClient();
    const loader = loadGameDataBundle;
    const accountId = `phira:community:${PLAYER_ID}`;

    const result = await loader(context({ gameId: 'phira', providerId: 'phira-community', accountId, client }));
    expect(result.bundle.payload).toMatchObject({ kind: 'phira', source: { isStale: false } });

    const entity = await client.ensureQueryData(phiraPlayerQueryOptions(client, PLAYER_ID));
    expect(entity).toBe(client.getQueryData(phiraPlayerEntityKey(PLAYER_ID)));
    expect(entity.player.id).toBe(PLAYER_ID);
    expect(userSpy).toHaveBeenCalledTimes(1);
  });
});


it('TUF 已提交旧实体保持完整来源与原抓取时间', async () => {
  const client = createClient();
  const source = { kind: 'tuf' as const, label: 'The Universal Forums', updatedAt: '2025-01-01T00:00:00.000Z', isStale: true };
  client.setQueryData(tufPlayerEntityKey(25), { data: tufPlayer, source });
  const spy = jest.spyOn(tufProvider, 'getPlayerProfile');
  const result = await loadGameDataBundle(context({ gameId: 'adofai', providerId: 'tuf', accountId: 'adofai:tuf:25', client }));
  expect(result.bundle.payload).toMatchObject({ source });
  expect(spy).not.toHaveBeenCalled();
});

it('中二分项认证失败经过加载器和主动刷新仍保留具体项与部分结果', async () => {
  const client = createClient();
  const accountId = 'chunithm:lxns:partial';
  const source = { kind: 'lxns' as const, label: '落雪咖啡屋', updatedAt: '2025-01-01T00:00:00.000Z', isStale: true };
  jest.spyOn(ChunithmPersonalService.prototype, 'refresh').mockResolvedValue({
    status: 'partial',
    value: { player: null, scores: [], bests: emptyChunithmBests(), source },
    metadata: { provider: 'lxns', label: source.label, fetchedAt: source.updatedAt, revision: null },
    requested: ['player', 'scores', 'bests'], completed: ['player', 'bests'],
    failures: [{ code: 'authentication', target: 'scores', diagnostic: 'token expired', retryable: false }],
  });
  const input = context({ gameId: 'chunithm', providerId: 'lxns', accountId, client });
  input.session = { mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 1000, persistable: true };
  input.protocolScoreProvider = new ChunithmScoreProvider(input.session);
  input.hasSessionData = true;
  const loaded = await loadGameDataBundle(input);
  registerGameDataBackground(input.queryKey, loaded.background);
  const result = await refreshGameDataBundle({ client,
    params: { accountId, gameId: 'chunithm', providerId: 'lxns', mode: null },
    refetch: () => ({ data: loaded.bundle }),
  });
  expect(result).toMatchObject({ status: 'partial', completed: ['player', 'bests'], failures: [{ code: 'authentication', target: 'scores' }] });
  expect(result.metadata?.fetchedAt).toBe(source.updatedAt);
});

it('中二没有可用快照的认证失败保持authentication而不是no_data', async () => {
  const client = createClient();
  const accountId = 'chunithm:lxns:auth';
  jest.spyOn(ChunithmPersonalService.prototype, 'refresh').mockResolvedValue({
    status: 'failed', value: null, metadata: null,
    requested: ['player', 'scores', 'bests'], completed: [],
    failures: [{ code: 'authentication', target: 'player', diagnostic: 'token expired', retryable: false }],
  });
  const input = context({ gameId: 'chunithm', providerId: 'lxns', accountId, client });
  input.session = { mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 1000, persistable: true };
  input.protocolScoreProvider = new ChunithmScoreProvider(input.session);
  input.hasSessionData = true;
  const result = await refreshGameDataBundle({ client,
    params: { accountId, gameId: 'chunithm', providerId: 'lxns', mode: null },
    refetch: async () => {
      try { return { data: (await loadGameDataBundle(input)).bundle }; }
      catch (error) { expect(error).toBeInstanceOf(ProviderError); throw error; }
    },
  });
  expect(result).toMatchObject({ status: 'failed', failures: [{ code: 'authentication' }] });
});

it('中二示例加载按上游新曲集合展示 N20 和玩家 Rating', async () => {
  const client = createClient();
  const input = context({ gameId: 'chunithm', providerId: 'chunithm-test', accountId: 'chunithm:test', client });
  input.catalogQueries.chunithm = async () => mapChunithmCatalog({
    versions: [
      { id: 18, version: 23000, title: 'CHUNITHM VERSE' },
      { id: 19, version: 24000, title: 'CHUNITHM X-VERSE' },
      { id: 20, version: 24500, title: 'CHUNITHM X-VERSE-X' },
    ],
    genres: [],
    songs: [
      { id: 1, title: '旧曲', version: 23001,
        difficulties: [{ difficulty: 3, level: '16', level_value: 16, version: 23001 }] },
      { id: 2, title: '新曲', version: 24001,
        difficulties: [{ difficulty: 3, level: '15', level_value: 15, version: 24001 }] },
    ],
  });
  jest.spyOn(ChunithmCatalogProvider.prototype, 'getNewVersionTitles')
    .mockResolvedValue(['CHUNITHM X-VERSE', 'CHUNITHM X-VERSE-X']);

  const { bundle } = await loadGameDataBundle(input);

  expect(bundle.payload).toMatchObject({ kind: 'chunithm', player: { name: '玩家', rating: 0.7 },
    playerScore: { value: 0.7, display: '0.70' },
    bestSections: [
      { id: 'b30', scores: [{ id: 1 }] },
      { id: 'new20', scores: [{ id: 2 }] },
    ],
  });
});

it('中二新曲版本读取失败时沿用加载失败入口', async () => {
  const client = createClient();
  const input = context({ gameId: 'chunithm', providerId: 'chunithm-test', accountId: 'chunithm:test', client });
  input.catalogQueries.chunithm = async () => mapChunithmCatalog({
    versions: [{ id: 19, version: 24000, title: 'CHUNITHM X-VERSE' }], genres: [], songs: [],
  });
  jest.spyOn(ChunithmCatalogProvider.prototype, 'getNewVersionTitles')
    .mockRejectedValue(new ProviderError('network', 'network unavailable', true));

  await expect(loadGameDataBundle(input)).rejects.toMatchObject({ code: 'network' });
});

it.each<{ gameId: CatalogTestGameId; value: number; display: string }>([
  { gameId: 'phira', value: 19, display: '19.00' },
  { gameId: 'adofai', value: 114514, display: '114514' },
  { gameId: 'majdata-net', value: 114514, display: '114514.0000%' },
  { gameId: 'osu-standard', value: 40000, display: '40,000' },
  { gameId: 'osu-mania', value: 40000, display: '40,000' },
  { gameId: 'osu-catch', value: 40000, display: '40,000' },
  { gameId: 'osu-taiko', value: 40000, display: '40,000' },
])('$gameId 示例总览无需登录即可显示固定数值和已保存名称', async ({ gameId, value, display }) => {
  const client = createClient();
  const account = createCatalogTestAccount(gameId, `${gameId} 玩家`);
  const input = context({ gameId, providerId: account.providerId!, accountId: account.id, client });
  input.activeAccount = account;
  const { bundle } = await loadGameDataBundle(input);
  expect(bundle.gameId).toBe(gameId);
  expect(bundle.payload).toMatchObject({ playerScore: { value, display }, source: { kind: 'generated', isStale: false } });
  switch (bundle.payload.kind) {
    case 'phira':
      expect(bundle.payload.snapshot).toMatchObject({ player: { name: account.displayName, rks: 19 },
        stats: { avgAccuracy: 1, numRecords: 114514 } });
      break;
    case 'adofai':
      expect(bundle.payload.player).toMatchObject({ name: account.displayName, rankedScore: 114514, globalRank: 1, averageXacc: 100 });
      break;
    case 'majdata-net':
      expect(bundle.payload.snapshot.player.username).toBe(account.displayName);
      break;
    case 'osu':
      expect(bundle.payload.player).toMatchObject({ username: account.displayName, pp: 40000, accuracy: 100 });
      break;
    default: throw new Error('示例总览缺少游戏数据');
  }
});

it('Rizline 示例总览随曲库更新重建所有满成绩和总 RKS，SP 不计算 RKS', async () => {
  const client = createClient();
  const catalog = { snapshot: rizlineCatalog(), source: fixtureSource };
  client.setQueryData(RIZLINE_CATALOG_QUERY_KEY, catalog);
  const account = createCatalogTestAccount('rizline', 'Rizline 示例玩家');
  const input = context({ gameId: 'rizline', providerId: account.providerId!, accountId: account.id, client });
  input.activeAccount = account;
  const { bundle } = await loadGameDataBundle(input);
  expect(bundle.payload).toMatchObject({ kind: 'rizline', player: { username: account.displayName },
    playerScore: { value: 3.5625 }, records: [{ score: 1002000, achievements: 120, ap: true, rks: 142.5 }] });
  client.setQueryData(input.queryKey, bundle);

  const nextCatalog = rizlineCatalog('r2');
  nextCatalog.songs[0].charts = [rizlineChart({ constant: 13, maxScore: 1003000 }),
    rizlineChart({ id: 'chart.Song.A.0.SP', difficulty: 'SP', constant: null, maxScore: null })];
  await applyRizlineCatalog(client, { snapshot: nextCatalog, source: fixtureSource });
  const current = client.getQueryData<typeof bundle>(input.queryKey)!;
  expect(current.payload).toMatchObject({ kind: 'rizline', playerScore: { value: 3.8375 }, records: [
    { difficulty: 'IN', score: 1003000, achievements: 120, ap: true, rks: 153.5 },
    { difficulty: 'SP', score: 1000000, achievements: 120, ap: true, rks: null },
  ] });
});
