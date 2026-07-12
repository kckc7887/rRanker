import type { CatalogSnapshot } from '@/domain/models';
import { fixtureCatalog } from '@/fixtures/sanitized';
import type { CatalogProvider } from '@/providers/contracts';
import type { CatalogRepository } from '@/repositories/catalog-repository';
import { CatalogService } from '@/services/catalog-service';

class MemoryCatalogRepository implements CatalogRepository {
  value: CatalogSnapshot | null = null;
  async getLatestCatalog() { return this.value; }
  async saveCatalog(catalog: CatalogSnapshot) { this.value = structuredClone(catalog); }
}

describe('CatalogService', () => {
  it('returns stale catalog cache without overwriting it when LXNS fails', async () => {
    const repository = new MemoryCatalogRepository();
    repository.value = structuredClone(fixtureCatalog);
    const saved = structuredClone(repository.value);
    const provider: CatalogProvider = { getCatalog: async () => { throw new Error('network'); } };
    const catalog = await new CatalogService(provider, repository).load();
    expect(catalog.source).toMatchObject({ kind: 'cache', isStale: true });
    expect(catalog.source.label).toContain('LXNS 曲库缓存');
    expect(repository.value).toEqual(saved);
  });

  it('throws when LXNS and local catalog cache are both unavailable', async () => {
    const provider: CatalogProvider = { getCatalog: async () => { throw new Error('network'); } };
    await expect(new CatalogService(provider, new MemoryCatalogRepository()).load()).rejects.toThrow('network');
  });
});
