import { fixtureSource } from '@/fixtures/sanitized';
import type { PhigrosGameDataPayload } from '@/services/phigros-save-cache';
import { PhigrosSaveCache, stalePhigrosPayload } from '@/services/phigros-save-cache';

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
    async getResource<T>(key: string): Promise<T | null> { return (store.get(key) as T | undefined) ?? null; },
    async saveResource(key: string, _version: number, _updatedAt: string, value: unknown, assertCurrent?: () => void) {
      assertCurrent?.();
      store.set(key, value);
    },
  };
}

describe('PhigrosSaveCache', () => {
  it.each([
    {}, { ...makePayload(), records: [{}] }, { ...makePayload(), progress: { cleared: null } },
    { ...makePayload(), source: { kind: 'unknown' } },
  ])('rejects damaged payloads without deleting the stored value', async damaged => {
    const store = new Map<string, unknown>([['phigros-save:player', damaged]]);
    const cache = new PhigrosSaveCache(makeRepository(store));
    await expect(cache.load('player')).resolves.toBeNull();
    expect(store.get('phigros-save:player')).toBe(damaged);
  });
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
    expect(marked.source.kind).toBe(fixtureSource.kind);
    expect(marked.source.updatedAt).toBe(fixtureSource.updatedAt);
    expect(marked.source.isStale).toBe(true);
    expect(marked.source.label).toBe(fixtureSource.label);
    expect(marked.catalogSource.isStale).toBe(true);
  });
});
