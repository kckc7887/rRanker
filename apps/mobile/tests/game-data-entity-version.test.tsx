import { jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';
import { selectGameDataLoader, type GameDataLoaderContext } from '@/hooks/game-data-loaders';
import { tufPlayerQueryOptions, tufPlayerEntityKey } from '@/hooks/use-tuf';
import { museDashPlayerQueryOptions, museDashPlayerEntityKey } from '@/hooks/use-muse-dash';
import { phiraPlayerQueryOptions, phiraPlayerEntityKey } from '@/hooks/use-phira';
import { gameDataQueryKey } from '@/services/game-data-query';
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
    async saveCatalog() { return undefined; }
    async getLatestCatalog() { return null; }
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
  return {
    activeGameId: input.gameId,
    activeProviderId: input.providerId,
    activeAccountId: input.accountId,
    session: null,
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

beforeEach(() => { jest.restoreAllMocks(); });

describe('总览与详情读取同一个实体', () => {
  it('TUF 玩家实体在总览加载后立即可被页面读到同一版本，且不重复请求网络', async () => {
    const profileSpy = jest.spyOn(tufProvider, 'getPlayerProfile').mockResolvedValue(tufPlayer);
    const client = new QueryClient();
    const loader = selectGameDataLoader('adofai');
    const accountId = 'adofai:tuf:25';

    const result = await loader(context({ gameId: 'adofai', providerId: 'tuf', accountId, client }));
    expect(result.bundle.payload).toMatchObject({ kind: 'adofai', player: { rankedScore: 1824.52 } });

    const entity = await client.ensureQueryData(tufPlayerQueryOptions(25));
    expect(entity).toBe(tufPlayer);
    expect(client.getQueryData(tufPlayerEntityKey(25))).toBe(entity);
    expect(profileSpy).toHaveBeenCalledTimes(1);
    expect(result.bundle.payload).toMatchObject({ source: { kind: 'tuf', isStale: false } });
  });

  it('Muse Dash 玩家实体在总览加载后立即可被随机歌曲页读到同一版本', async () => {
    const playerSpy = jest.spyOn(museDashProvider, 'getPlayer').mockResolvedValue(museDashPlayer);
    const client = new QueryClient();
    const loader = selectGameDataLoader('musedash');
    const accountId = 'musedash:musedash-moe:u-1';

    const result = await loader(context({ gameId: 'musedash', providerId: 'musedash-moe', accountId, client }));
    expect(result.bundle.payload).toMatchObject({ kind: 'musedash', player: { rl: 3.45 }, source: { isStale: false } });

    const entity = await client.ensureQueryData(museDashPlayerQueryOptions('u-1'));
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
    const client = new QueryClient();
    const loader = selectGameDataLoader('phira');
    const accountId = `phira:community:${PLAYER_ID}`;

    const result = await loader(context({ gameId: 'phira', providerId: 'phira-community', accountId, client }));
    expect(result.bundle.payload).toMatchObject({ kind: 'phira', source: { isStale: false } });

    const entity = await client.ensureQueryData(phiraPlayerQueryOptions(PLAYER_ID));
    expect(entity).toBe(client.getQueryData(phiraPlayerEntityKey(PLAYER_ID)));
    expect(entity.player.id).toBe(PLAYER_ID);
    expect(userSpy).toHaveBeenCalledTimes(1);
  });
});
