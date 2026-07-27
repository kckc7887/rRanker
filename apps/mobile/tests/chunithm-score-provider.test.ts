import type { ResourceRepository } from '@/repositories/resource-repository';
import { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';

const session = {
  mode: 'lxns-oauth',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: Date.now() + 120_000,
  persistable: true,
} as const;

const player = {
  name: '中二玩家',
  level: 99,
  rating: 17.25,
  rating_possession: 'rainbow',
  friend_code: 123456789000000,
  class_emblem: { base: 1, medal: 2 },
  reborn_count: 3,
  over_power: 23456.78,
  over_power_progress: 88.5,
  currency: 100,
  total_currency: 200,
  total_play_count: 300,
  trophy: null,
  character: { id: 16620, level: 10 },
  name_plate: null,
  map_icon: { id: 19 },
  upload_time: '2026-07-27T00:00:00Z',
};

const scores = [
  {
    id: 3,
    song_name: 'ULTIMA TEST',
    level: '14+',
    level_index: 4,
    score: 1009000,
    rating: 15.25,
    over_power: 102.5,
    clear: 'clear',
    full_combo: 'alljustice',
    full_chain: null,
    rank: 'sssp',
  },
  {
    id: 90001,
    song_name: 'WORLD’S END TEST',
    level: '狂',
    level_index: 5,
    score: 1010000,
    clear: 'clear',
    full_combo: null,
    full_chain: null,
    rank: 'sssp',
  },
];

const bests = {
  bests: [scores[0], scores[1]],
  selections: [scores[0]],
  new_bests: [scores[1]],
};

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status === 200, code: status, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ChunithmScoreProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reads all three personal endpoints with the same bearer token and keeps WORLD’S END', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        Authorization: 'Bearer access-token',
      });
      if (url.endsWith('/scores')) return response(scores);
      if (url.endsWith('/bests')) return response(bests);
      return response(player);
    });
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await new ChunithmScoreProvider(session).getSnapshot();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
      'https://maimai.lxns.net/api/v0/user/chunithm/player',
      'https://maimai.lxns.net/api/v0/user/chunithm/player/scores',
      'https://maimai.lxns.net/api/v0/user/chunithm/player/bests',
    ]));
    expect(snapshot.player).toMatchObject({
      name: '中二玩家',
      rating: 17.25,
      map_icon: { id: 19 },
    });
    expect(snapshot.scores).toEqual([
      expect.objectContaining({ id: 3, level_index: 4, score: 1009000 }),
      expect.objectContaining({ id: 90001, level_index: 5, score: 1010000 }),
    ]);
    expect(snapshot.bests).toMatchObject({
      bests: [
        expect.objectContaining({ id: 3 }),
        expect.objectContaining({ id: 90001, level_index: 5 }),
      ],
      selections: [expect.objectContaining({ id: 3 })],
      new_bests: [expect.objectContaining({ id: 90001, level_index: 5 })],
    });
  });

  it('accepts an authenticated account without synchronized Chunithm data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(null)));
    await expect(new ChunithmScoreProvider(session).getSnapshot()).resolves.toMatchObject({
      player: null,
      scores: [],
    });
  });

  it('accepts nullable player collection fields documented by LXNS', async () => {
    const nullableCollections = {
      ...player,
      trophy: null,
      character: null,
      name_plate: null,
      map_icon: null,
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.endsWith('/scores') ? response([]) : response(nullableCollections)
    )));

    await expect(new ChunithmScoreProvider(session).getPlayer()).resolves.toMatchObject({
      name: '中二玩家',
      trophy: null,
      character: null,
      name_plate: null,
      map_icon: null,
    });
  });

  it('refreshes an expired shared OAuth session before both personal requests', async () => {
    const rotated = vi.fn();
    const expiredSession = {
      ...session,
      expiresAt: Date.now() - 1,
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/oauth/token')) {
        return new Response(JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
          expires_in: 900,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer fresh-access' });
      if (url.endsWith('/scores')) return response([]);
      if (url.endsWith('/bests')) return response({ bests: [], selections: [], new_bests: [] });
      return response(player);
    });
    vi.stubGlobal('fetch', fetchMock);

    await new ChunithmScoreProvider(expiredSession, rotated).getSnapshot();

    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/oauth/token'))).toHaveLength(1);
    expect(rotated).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
    }));
  });

  it('reports malformed upstream data as a retryable schema error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ name: 123 })));
    await expect(new ChunithmScoreProvider(session).getPlayer()).rejects.toMatchObject({
      code: 'upstream_schema',
      retryable: true,
    });
  });

  it('reports a request timeout as retryable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('timeout');
          error.name = 'AbortError';
          reject(error);
        });
      })
    )));

    const pending = expect(
      new ChunithmScoreProvider(session).getPlayer(),
    ).rejects.toMatchObject({ code: 'timeout', retryable: true });
    await vi.advanceTimersByTimeAsync(12_000);

    await pending;
  });

  it('falls back to the latest valid account snapshot on a later network failure', async () => {
    const cached = {
      player,
      scores: [scores[0]],
      source: {
        kind: 'lxns' as const,
        label: '落雪咖啡屋',
        updatedAt: '2026-07-27T00:00:00Z',
        isStale: false,
      },
    };
    const repository: ResourceRepository = {
      getResource: async <T>(_key: string, schemaVersion: number) => (
        schemaVersion === 1 ? cached as T : null
      ),
      saveResource: async () => undefined,
      deleteResource: async () => undefined,
    };
    const provider = {
      getSnapshot: vi.fn().mockRejectedValue(new Error('network')),
    } as unknown as ChunithmScoreProvider;

    const result = await new ChunithmPersonalService(
      provider,
      repository as never,
      'chunithm:lxns:1',
    ).load();

    expect(result.bests).toEqual({ bests: [], selections: [], new_bests: [] });
    expect(result.source).toMatchObject({ isStale: true, label: '落雪咖啡屋（缓存）' });
    expect(result.player?.name).toBe('中二玩家');
  });
});
