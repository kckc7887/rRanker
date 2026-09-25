import type { ChunithmBests, ChunithmPersonalSnapshot } from '@/domain/chunithm-personal';
import { chunithmPersonalResourceKey, emptyChunithmBests } from '@/domain/chunithm-personal';
import type { DataSource } from '@/domain/models';
import { ProviderError } from '@/providers/errors';
import type { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import {
  refreshNeedsLogin,
  refreshRetryTargets,
  refreshSucceeded,
  refreshedFetchedAt,
  snapshotMetadataOf,
} from '@/domain/refresh-result';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const accountId = 'chunithm:lxns:refresh';
const providerSource: DataSource = {
  kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-01-01T00:00:00.000Z', isStale: false,
};

function makeSnapshot(overrides: Partial<ChunithmPersonalSnapshot> = {}): ChunithmPersonalSnapshot {
  return { player: null, scores: [], bests: emptyChunithmBests(), source: providerSource, ...overrides };
}

function makeRepository(store: Map<string, unknown>) {
  return {
    getResource: async (key: string) => store.get(key) ?? null,
    saveResource: async (key: string, _version: number, _updatedAt: string, value: unknown) => {
      store.set(key, value);
    },
  } as unknown as SqliteSnapshotRepository;
}

type PartLoaders = {
  player: () => Promise<ChunithmPersonalSnapshot['player']>;
  scores: () => Promise<ChunithmPersonalSnapshot['scores']>;
  bests: () => Promise<ChunithmBests>;
};

function makePartsProvider(parts: PartLoaders) {
  return {
    getPlayer: () => parts.player(),
    getScores: () => parts.scores(),
    getBests: () => parts.bests(),
  } as unknown as ChunithmScoreProvider;
}

const signal = () => new AbortController().signal;
const player = (name: string) => ({ name, rating: 1 } as never);

describe('ChunithmPersonalService.refresh', () => {
  it('only advances the snapshot time when player, scores and bests all completed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T03:00:00.000Z'));
    try {
      const store = new Map<string, unknown>();
      const service = new ChunithmPersonalService(makePartsProvider({
        player: async () => player('新玩家'),
        scores: async () => [{ id: 1 } as never],
        bests: async () => ({ ...emptyChunithmBests(), bests: [{ id: 2 } as never] }),
      }), makeRepository(store), accountId);

      const result = await service.refresh(signal());

      expect(result.status).toBe('success');
      expect(refreshSucceeded(result)).toBe(true);
      expect(result.requested).toEqual(['player', 'scores', 'bests']);
      expect(result.completed).toEqual(['player', 'scores', 'bests']);
      expect(result.failures).toEqual([]);
      expect(snapshotMetadataOf(result.value!.source)).toEqual({
        provider: 'lxns', label: '落雪咖啡屋', fetchedAt: '2026-09-02T03:00:00.000Z', revision: null,
      });
      expect(refreshedFetchedAt(result, '2026-01-01T00:00:00.000Z')).toBe('2026-09-02T03:00:00.000Z');
      const stored = store.get(chunithmPersonalResourceKey(accountId)) as ChunithmPersonalSnapshot;
      expect(stored.source.updatedAt).toBe('2026-09-02T03:00:00.000Z');
      expect(stored.bests.bests).toEqual([{ id: 2 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the successful parts and the concrete failures when only some items completed', async () => {
    const cached = makeSnapshot({
      player: player('旧玩家'),
      scores: [{ id: 10 } as never],
      bests: { ...emptyChunithmBests(), bests: [{ id: 11 } as never] },
    });
    const store = new Map<string, unknown>([[chunithmPersonalResourceKey(accountId), cached]]);
    const service = new ChunithmPersonalService(makePartsProvider({
      player: async () => player('新玩家'),
      scores: async () => [{ id: 12 } as never],
      bests: async () => { throw new ProviderError('network', '落雪读取失败', true); },
    }), makeRepository(store), accountId);

    const result = await service.refresh(signal());

    expect(result.status).toBe('partial');
    expect(refreshSucceeded(result)).toBe(false);
    expect(result.completed).toEqual(['player', 'scores']);
    expect(result.failures).toEqual([
      { code: 'network', target: 'bests', diagnostic: '落雪读取失败', retryable: true },
    ]);
    expect(refreshRetryTargets(result)).toEqual(['bests']);
    expect(refreshNeedsLogin(result)).toBe(false);
    // 只有成功项被替换，失败项保留上一次的值；完整成功时间不推进。
    expect(result.value?.player).toMatchObject({ name: '新玩家' });
    expect(result.value?.bests.bests).toEqual([{ id: 11 }]);
    expect(result.metadata?.fetchedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(refreshedFetchedAt(result, cached.source.updatedAt)).toBe('2026-01-01T00:00:00.000Z');
    expect(result.value?.source).toMatchObject({
      kind: 'lxns', label: '落雪咖啡屋', updatedAt: '2026-01-01T00:00:00.000Z', isStale: true,
    });
    expect((store.get(chunithmPersonalResourceKey(accountId)) as ChunithmPersonalSnapshot).source.updatedAt)
      .toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns the still usable old snapshot without advancing its time when every item failed', async () => {
    const cached = makeSnapshot({ player: player('旧玩家'), scores: [{ id: 10 } as never] });
    const store = new Map<string, unknown>([[chunithmPersonalResourceKey(accountId), cached]]);
    const service = new ChunithmPersonalService(makePartsProvider({
      player: async () => { throw new Error('offline'); },
      scores: async () => { throw new Error('offline'); },
      bests: async () => { throw new Error('offline'); },
    }), makeRepository(store), accountId);

    const result = await service.refresh(signal());

    expect(result.status).toBe('failed');
    expect(result.completed).toEqual([]);
    expect(result.failures.map((failure) => failure.target)).toEqual(['player', 'scores', 'bests']);
    expect(refreshRetryTargets(result)).toEqual(['player', 'scores', 'bests']);
    expect(result.value?.player).toMatchObject({ name: '旧玩家' });
    expect(result.value?.source.isStale).toBe(true);
    expect(result.value?.source.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(refreshedFetchedAt(result, cached.source.updatedAt)).toBe('2026-01-01T00:00:00.000Z');
    expect(refreshedFetchedAt(result, '2026-05-05T00:00:00.000Z')).toBe('2026-05-05T00:00:00.000Z');
    // 全失败不写入缓存。
    expect(store.get(chunithmPersonalResourceKey(accountId))).toBe(cached);
  });

  it('reports an expired login by error code even when there is no fallback snapshot', async () => {
    const store = new Map<string, unknown>();
    const service = new ChunithmPersonalService(makePartsProvider({
      player: async () => { throw new ProviderError('authentication', '登录已失效', false); },
      scores: async () => { throw new ProviderError('authentication', '登录已失效', false); },
      bests: async () => { throw new ProviderError('authentication', '登录已失效', false); },
    }), makeRepository(store), 'chunithm:lxns:no-cache');

    const result = await service.refresh(signal());

    expect(result.status).toBe('failed');
    expect(result.value).toBeNull();
    expect(result.metadata).toBeNull();
    expect(refreshNeedsLogin(result)).toBe(true);
    expect(refreshRetryTargets(result)).toEqual([]);
    expect(store.size).toBe(0);
  });
});
