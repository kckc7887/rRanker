import { jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { loadGameDataBundle, type GameDataLoaderContext } from '@/services/game-data-loaders';
import { tufPlayerQueryOptions, tufPlayerEntityKey } from '@/services/tuf-query';
import { museDashPlayerQueryOptions, museDashPlayerEntityKey } from '@/services/muse-dash-query';
import { phiraPlayerQueryOptions, phiraPlayerEntityKey } from '@/services/phira-query';
import { gameDataCatalogQueries } from '@/services/game-data-loader-queries';
import { gameDataQueryKey, registerGameDataBackground, refreshGameDataBundle } from '@/services/game-data-query';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
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
    expect(entity.data).toBe(tufPlayer);
    expect(client.getQueryData(tufPlayerEntityKey(25))).toBe(entity);
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
    expect(entity?.data).toBe(museDashPlayer);
    expect(client.getQueryData(museDashPlayerEntityKey('u-1'))).toBe(entity);
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
