import type { CatalogSnapshot } from '@/domain/models';
import type { CatalogProvider } from '@/providers/contracts';
import type { CatalogRepository } from '@/repositories/catalog-repository';

export class CatalogService {
  constructor(
    private readonly provider: CatalogProvider,
    private readonly repository?: CatalogRepository,
  ) {}

  async load(): Promise<CatalogSnapshot> {
    try {
      const catalog = await this.provider.getCatalog();
      await this.repository?.saveCatalog(catalog);
      return catalog;
    } catch (error) {
      const cached = await this.repository?.getLatestCatalog();
      if (!cached) throw error;
      return {
        ...cached,
        source: {
          ...cached.source,
          kind: 'cache',
          label: `LXNS 曲库缓存（原：${cached.source.label}）`,
          isStale: true,
        },
      };
    }
  }
}
