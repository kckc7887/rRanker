import type { CatalogSnapshot, ScoreSnapshot } from '@/domain/models';
import { FixtureCatalogProvider, FixtureProvider } from '@/providers/fixture-provider';
import type { CatalogRepository } from '@/repositories/catalog-repository';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { ScoreService } from '@/services/score-service';

class MemoryRepository implements SnapshotRepository, CatalogRepository {
  value: ScoreSnapshot | null = null;
  catalog: CatalogSnapshot | null = null;
  async initialize() {}
  async getLatest() { return this.value; }
  async save(snapshot: ScoreSnapshot) { this.value = structuredClone(snapshot); }
  async clear() { this.value = null; }
  async getLatestCatalog() { return this.catalog; }
  async saveCatalog(catalog: CatalogSnapshot) { this.catalog = structuredClone(catalog); }
}

describe('ScoreService', () => {
  it('stores a valid snapshot after refresh', async () => {
    const repository = new MemoryRepository();
    const snapshot = await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), repository, repository,
    ).load();
    expect(snapshot.records).toHaveLength(54); expect(repository.value?.best50.b35).toHaveLength(35);
  });
  it('returns stale cache without overwriting it when upstream fails', async () => {
    const repository = new MemoryRepository();
    await new ScoreService(
      new FixtureProvider(), new FixtureCatalogProvider(), repository, repository,
    ).load();
    const saved = structuredClone(repository.value);
    const fail = async (): Promise<never> => { throw new Error('network'); };
    const failingProvider = { getPlayer: fail, getRecords: fail };
    const cached = await new ScoreService(
      failingProvider, new FixtureCatalogProvider(), repository, repository,
    ).load();
    expect(cached.source.kind).toBe('cache'); expect(cached.source.isStale).toBe(true);
    expect(repository.value).toEqual(saved);
  });

  it('fetches player, records, and catalog exactly once per refresh', async () => {
    const score = new FixtureProvider();
    const catalog = new FixtureCatalogProvider();
    const getPlayer = vi.spyOn(score, 'getPlayer');
    const getRecords = vi.spyOn(score, 'getRecords');
    const getCatalog = vi.spyOn(catalog, 'getCatalog');
    await new ScoreService(score, catalog).load();
    expect(getPlayer).toHaveBeenCalledTimes(1);
    expect(getRecords).toHaveBeenCalledTimes(1);
    expect(getCatalog).toHaveBeenCalledTimes(1);
  });
});
