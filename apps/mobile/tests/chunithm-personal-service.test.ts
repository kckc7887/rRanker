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

  it('reads the local snapshot as a marked cache read that keeps its provider', async () => {
    const store = new Map<string, unknown>([
      ['chunithm-score:acct-read', makeSnapshot({ player: { name: '本地快照' } as never })],
    ]);
    const service = new ChunithmPersonalService(
      makeProvider(async () => makeSnapshot()),
      makeRepository(store),
      'acct-read',
    );

    const cached = await service.loadCached();

    expect(cached?.source).toEqual({ ...fixtureSource, isStale: true });
    expect(cached?.player).toMatchObject({ name: '本地快照' });
  });
});
