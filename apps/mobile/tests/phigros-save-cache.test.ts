import { fixtureSource } from '@/fixtures/sanitized';
import type { PhigrosGameDataPayload } from '@/services/phigros-save-cache';
import { PhigrosSaveCache, stalePhigrosPayload } from '@/services/phigros-save-cache';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => ({
    execAsync: vi.fn(async () => undefined),
    getFirstAsync: vi.fn(async () => null),
    runAsync: vi.fn(async () => undefined),
  })),
}));

function makePayload(overrides: Partial<PhigrosGameDataPayload> = {}): PhigrosGameDataPayload {
  return {
    kind: 'phigros',
    player: {
      id: 'phi-player',
      displayName: '尘言',
      rating: 15.4321,
      additionalRating: 0,
      source: fixtureSource,
    },
    records: [],
    bestSections: [],
    playerScore: { label: 'Raking Score', value: 15.4321, display: '15.4321' },
    challengeModeRank: 0,
    source: fixtureSource,
    saveUpdatedAt: '2026-01-01T00:00:00Z',
    catalogSource: fixtureSource,
    dataAmount: '0',
    progress: { cleared: [0, 0, 0, 0], fullCombo: [0, 0, 0, 0], phi: [0, 0, 0, 0] },
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

describe('PhigrosSaveCache', () => {
  it('returns null when nothing was persisted yet', async () => {
    const cache = new PhigrosSaveCache(makeRepository(new Map()));
    await expect(cache.load('phi-player')).resolves.toBeNull();
  });

  it('round-trips a payload per account', async () => {
    const store = new Map<string, unknown>();
    const cache = new PhigrosSaveCache(makeRepository(store));
    await cache.save('phi-player-a', makePayload());
    await expect(cache.load('phi-player-a')).resolves.toMatchObject({
      kind: 'phigros',
      saveUpdatedAt: '2026-01-01T00:00:00Z',
    });
    await expect(cache.load('phi-player-b')).resolves.toBeNull();
  });

  it('marks cache-first payloads as stale without rewriting the labels', () => {
    const marked = stalePhigrosPayload(makePayload());
    expect(marked.source.kind).toBe('cache');
    expect(marked.source.isStale).toBe(true);
    expect(marked.source.label).toBe(fixtureSource.label);
    expect(marked.catalogSource.isStale).toBe(true);
  });
});
