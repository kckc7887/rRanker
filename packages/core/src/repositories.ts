import type { CatalogSnapshot, ScoreSnapshot } from './models';

export interface CatalogRepository {
  getLatestCatalog(): Promise<CatalogSnapshot | null>;
  saveCatalog(catalog: CatalogSnapshot): Promise<void>;
}

export interface SnapshotRepository {
  initialize(): Promise<void>;
  getLatest(accountId: string): Promise<ScoreSnapshot | null>;
  save(accountId: string, snapshot: ScoreSnapshot): Promise<void>;
  clear(accountId?: string): Promise<void>;
}
