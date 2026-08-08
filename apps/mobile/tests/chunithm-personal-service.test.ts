import {
  emptyChunithmBests,
  type ChunithmPersonalSnapshot,
} from '@/domain/chunithm-personal';
import { fixtureSource } from '@/fixtures/sanitized';
import type { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import { ChunithmPersonalService } from '@/services/chunithm-personal-service';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

function makeSnapshot(overrides: Partial<ChunithmPersonalSnapshot> = {}): ChunithmPersonalSnapshot {
  return {
    player: null,
    scores: [],
    bests: emptyChunithmBests(),
    source: fixtureSource,
    ...overrides,
  };
}

function makeRepository(store: Map<string, unknown>) {
  return {
    getResource: vi.fn(async (key: string) => store.get(key) ?? null),
    saveResource: vi.fn(async (key: string, _version: number, _updatedAt: string, value: unknown) => {
      store.set(key, value);
    }),
  } as unknown as SqliteSnapshotRepository;
}

function makeProvider(getSnapshot: () => Promise<ChunithmPersonalSnapshot>) {
  return { getSnapshot } as unknown as ChunithmScoreProvider;
}

describe('ChunithmPersonalService', () => {
  it('serves the cached snapshot first and refreshes in background', async () => {
    const store = new Map<string, unknown>([
      ['chunithm-score:acct-a', makeSnapshot({ player: { name: '旧数据' } as never })],
    ]);
    const repository = makeRepository(store);
    const service = new ChunithmPersonalService(
      makeProvider(async () => makeSnapshot({ player: { name: '新数据' } as never })),
      repository,
      'acct-a',
    );
    let notifyFresh: ((fresh: ChunithmPersonalSnapshot) => void) | null = null;
    const freshNotified = new Promise<ChunithmPersonalSnapshot>((resolve) => { notifyFresh = resolve; });

    const result = await service.loadCacheFirst((fresh) => notifyFresh?.(fresh));

    expect(result.source.isStale).toBe(true);
    expect(result.source.label).toBe('落雪咖啡屋（缓存）');
    const fresh = await freshNotified;
    expect(fresh.source.isStale).toBe(false);
    expect(fresh.player).toMatchObject({ name: '新数据' });
  });

  it('loads from the network when no snapshot is cached', async () => {
    const repository = makeRepository(new Map());
    const getSnapshot = vi.fn(async () => makeSnapshot({ player: { name: '网络数据' } as never }));
    const service = new ChunithmPersonalService(makeProvider(getSnapshot), repository, 'acct-b');

    const result = await service.loadCacheFirst(() => { throw new Error('不应命中后台刷新'); });

    expect(result.source.isStale).toBe(false);
    expect(getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite the query when the background refresh fails', async () => {
    const store = new Map<string, unknown>([
      ['chunithm-score:acct-c', makeSnapshot({ player: { name: '缓存数据' } as never })],
    ]);
    const repository = makeRepository(store);
    const service = new ChunithmPersonalService(
      makeProvider(async () => { throw new Error('network'); }),
      repository,
      'acct-c',
    );
    let onFreshCalled = false;

    const result = await service.loadCacheFirst(() => { onFreshCalled = true; });

    expect(result.source.isStale).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onFreshCalled).toBe(false);
  });
});
