import type { ChunithmBests, ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import { CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION, chunithmPersonalResourceKey, emptyChunithmBests } from '@/domain/chunithm-personal';
import type { DataSource } from '@/domain/models';
import { DatabaseSync } from 'node:sqlite';
import {
  refreshNeedsLogin,
  snapshotMetadataOf,
} from '@/domain/refresh-result';
let ProviderError: typeof import('@/providers/errors')['ProviderError'];
let ChunithmScoreProvider: typeof import('@/providers/chunithm-score-provider')['ChunithmScoreProvider'];
let ChunithmPersonalService: typeof import('@/services/chunithm-personal-service')['ChunithmPersonalService'];
let repository: InstanceType<typeof import('@/storage/sqlite-snapshot-repository')['SqliteSnapshotRepository']>;
let database: DatabaseSync;
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => database.exec(sql),
  runAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).run(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => database.prepare(sql).get(...args) ?? null,
}) }));
beforeEach(async () => {
  database = new DatabaseSync(':memory:'); vi.resetModules();
  ({ ProviderError } = await import('@/providers/errors'));
  ({ ChunithmScoreProvider } = await import('@/providers/chunithm-score-provider'));
  ({ ChunithmPersonalService } = await import('@/services/chunithm-personal-service'));
  const { SqliteSnapshotRepository } = await import('@/storage/sqlite-snapshot-repository');
  repository = new SqliteSnapshotRepository();
});
afterEach(() => { database.close(); vi.unstubAllGlobals(); });

const accountId = 'chunithm:lxns:refresh';
const providerSource: DataSource = {
  kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-01-01T00:00:00.000Z', isStale: false,
};

function makeSnapshot(overrides: Partial<ChunithmPersonalSnapshot> = {}): ChunithmPersonalSnapshot {
  return { player: null, scores: [], bests: emptyChunithmBests(), source: providerSource, ...overrides };
}

type PartLoaders = {
  player: () => Promise<ChunithmPersonalSnapshot['player']>;
  scores: () => Promise<ChunithmPersonalSnapshot['scores']>;
  bests: () => Promise<ChunithmBests>;
};

function makePartsProvider(parts: PartLoaders) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    let data: unknown;
    try { data = await (url.endsWith('/bests') ? parts.bests() : url.endsWith('/scores') ? parts.scores() : parts.player()); }
    catch (error) { if (error instanceof ProviderError && error.code === 'authentication') return new Response('{}', { status: 401 }); throw error; }
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }));
  return new ChunithmScoreProvider({ mode: 'lxns-oauth', accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 120000, persistable: true });
}
const signal = () => new AbortController().signal;
const player = (name: string) => ({ name, rating: 1, level: 1, friend_code: 1, class_emblem: { base: 0, medal: 0 }, reborn_count: 0,
  over_power: 0, over_power_progress: 0, currency: 0, total_currency: 0, total_play_count: 0 });
const score = (id: number) => ({ id, level_index: 3, score: 1000000, clear: 'clear' as const });

describe('ChunithmPersonalService.refresh', () => {
  it('only advances the snapshot time when player, scores and bests all completed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T03:00:00.000Z'));
    try {
      const service = new ChunithmPersonalService(makePartsProvider({
        player: async () => player('新玩家'),
        scores: async () => [score(1)],
        bests: async () => ({ ...emptyChunithmBests(), bests: [score(2)] }),
      }), accountId);

      const result = await service.refresh(signal());

      expect(result.status).toBe('success');

      expect(result.requested).toEqual(['player', 'scores', 'bests']);
      expect(result.completed).toEqual(['player', 'scores', 'bests']);
      expect(result.failures).toEqual([]);
      expect(snapshotMetadataOf(result.value!.source)).toEqual({
        provider: 'lxns', label: '落雪咖啡屋', fetchedAt: '2026-09-02T03:00:00.000Z', revision: null,
      });

      const stored = await repository.getResource(chunithmPersonalResourceKey(accountId), CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION) as ChunithmPersonalSnapshot;
      expect(stored.source.updatedAt).toBe('2026-09-02T03:00:00.000Z');
      expect(stored.bests.bests).toEqual([score(2)]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the successful parts and the concrete failures when only some items completed', async () => {
    const cached = makeSnapshot({
      player: player('旧玩家'),
      scores: [score(10)],
      bests: { ...emptyChunithmBests(), bests: [score(11)] },
    });
    await repository.saveResource(chunithmPersonalResourceKey(accountId), CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION, cached.source.updatedAt, cached);
    const service = new ChunithmPersonalService(makePartsProvider({
      player: async () => player('新玩家'),
      scores: async () => [score(12)],
      bests: async () => { throw new Error('落雪读取失败'); },
    }), accountId);

    const result = await service.refresh(signal());

    expect(result.status).toBe('partial');

    expect(result.completed).toEqual(['player', 'scores']);
    expect(result.failures).toEqual([
      expect.objectContaining({ code: 'network', target: 'bests', retryable: true }),
    ]);

    expect(refreshNeedsLogin(result)).toBe(false);
    expect(result.value?.player).toMatchObject({ name: '新玩家' });
    expect(result.value?.bests.bests).toEqual([score(11)]);
    expect(result.metadata?.fetchedAt).toBe('2026-01-01T00:00:00.000Z');

    expect(result.value?.source).toMatchObject({
      kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-01-01T00:00:00.000Z', isStale: true,
    });
    expect((await repository.getResource(chunithmPersonalResourceKey(accountId), CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION) as ChunithmPersonalSnapshot).source.updatedAt)
      .toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns the still usable old snapshot without advancing its time when every item failed', async () => {
    const cached = makeSnapshot({ player: player('旧玩家'), scores: [score(10)] });
    await repository.saveResource(chunithmPersonalResourceKey(accountId), CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION, cached.source.updatedAt, cached);
    const service = new ChunithmPersonalService(makePartsProvider({
      player: async () => { throw new Error('offline'); },
      scores: async () => { throw new Error('offline'); },
      bests: async () => { throw new Error('offline'); },
    }), accountId);

    const result = await service.refresh(signal());

    expect(result.status).toBe('failed');
    expect(result.completed).toEqual([]);
    expect(result.failures.map((failure) => failure.target)).toEqual(['player', 'scores', 'bests']);

    expect(result.value?.player).toMatchObject({ name: '旧玩家' });
    expect(result.value?.source.isStale).toBe(true);
    expect(result.value?.source.updatedAt).toBe('2026-01-01T00:00:00.000Z');


    expect(await repository.getResource(chunithmPersonalResourceKey(accountId), CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION)).toEqual(cached);
  });

  it('reports an expired login by error code even when there is no fallback snapshot', async () => {
    const service = new ChunithmPersonalService(makePartsProvider({
      player: async () => { throw new ProviderError('authentication', '登录已失效', false); },
      scores: async () => { throw new ProviderError('authentication', '登录已失效', false); },
      bests: async () => { throw new ProviderError('authentication', '登录已失效', false); },
    }), 'chunithm:lxns:no-cache');

    const result = await service.refresh(signal());

    expect(result.status).toBe('failed');
    expect(result.value).toBeNull();
    expect(result.metadata).toBeNull();
    expect(refreshNeedsLogin(result)).toBe(true);

    expect(await service.loadCached()).toBeNull();
  });
});

it('取消一个中二消费者仍允许另一个得到共享刷新终态', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = new AbortController(), second = new AbortController();
  const getPlayer = vi.fn(async () => { await gate; return player('新玩家'); });
  const service = new ChunithmPersonalService(makePartsProvider({ player: getPlayer,
    scores: async () => [], bests: async () => emptyChunithmBests(),
  }), 'chunithm:cancel-consumer');
  const a = service.refresh(first.signal), b = service.refresh(second.signal);
  first.abort(new Error('first left'));
  expect((await a).status).toBe('cancelled');
  release();
  expect((await b).status).toBe('success');
  expect(getPlayer).toHaveBeenCalledTimes(1);
});
