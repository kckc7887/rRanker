import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import { FixtureCatalogProvider, FixtureProvider } from '@/providers/fixture-provider';
import type { CatalogRepository } from '@/repositories/catalog-repository';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { ScoreService } from '@/services/score-service';

class MemoryRepository implements SnapshotRepository, CatalogRepository {
  value: ScoreSnapshot | null = null;
  catalog: CatalogSnapshot | null = null;
  byAccount = new Map<string, ScoreSnapshot>();
  async initialize() {}
  async getLatest(accountId: string) { return this.byAccount.get(accountId) ?? null; }
  async save(accountId: string, snapshot: ScoreSnapshot) {
    this.value = structuredClone(snapshot);
    this.byAccount.set(accountId, structuredClone(snapshot));
  }
  async clear(accountId?: string) {
    if (accountId) this.byAccount.delete(accountId);
    else {
      this.value = null;
      this.byAccount.clear();
    }
  }
  async getLatestCatalog() { return this.catalog; }
  async saveCatalog(catalog: CatalogSnapshot) { this.catalog = structuredClone(catalog); }
}

describe('ScoreService', () => {
  it('stores a valid snapshot after refresh', async () => {
    const repository = new MemoryRepository();
    const snapshot = await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), 'acct-a', repository, repository,
    ).load();
    expect(snapshot.records).toHaveLength(54); expect(repository.value?.best50.b35).toHaveLength(35);
  });
  it('returns stale cache without overwriting it when upstream fails', async () => {
    const repository = new MemoryRepository();
    await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), 'acct-a', repository, repository,
    ).load();
    const saved = structuredClone(repository.value);
    const fail = async (): Promise<never> => { throw new Error('network'); };
    const failingProvider = { getPlayer: fail, getRecords: fail };
    const cached = await new ScoreService(
      failingProvider, new FixtureCatalogProvider(), 'acct-a', repository, repository,
    ).load();
    expect(cached.source.kind).toBe('cache'); expect(cached.source.isStale).toBe(true);
    expect(repository.value).toEqual(saved);
  });

  it('isolates score cache by account id', async () => {
    const repository = new MemoryRepository();
    await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), 'acct-a', repository, repository,
    ).load();
    const fail = async (): Promise<never> => { throw new Error('network'); };
    await expect(new ScoreService(
      { getPlayer: fail, getRecords: fail },
      new FixtureCatalogProvider(),
      'acct-b',
      repository,
      repository,
    ).load()).rejects.toThrow('network');
  });

  it('fetches player, records, and catalog exactly once per refresh', async () => {
    const score = new FixtureProvider();
    const catalog = new FixtureCatalogProvider();
    const getPlayer = vi.spyOn(score, 'getPlayer');
    const getRecords = vi.spyOn(score, 'getRecords');
    const getCatalog = vi.spyOn(catalog, 'getCatalog');
    await new ScoreService(score, catalog, 'acct-a').load();
    expect(getPlayer).toHaveBeenCalledTimes(1);
    expect(getRecords).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });
});
