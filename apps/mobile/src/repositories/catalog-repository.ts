import type { CatalogSnapshot } from '@/domain/models';

export interface CatalogRepository {
  getLatestCatalog(): Promise<CatalogSnapshot | null>;
  saveCatalog(catalog: CatalogSnapshot): Promise<void>;
}
