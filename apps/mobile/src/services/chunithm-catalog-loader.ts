import {
  CHUNITHM_ALIAS_RESOURCE_KEY,
  CHUNITHM_CATALOG_RESOURCE_KEY,
  type ChunithmAliasSnapshot,
  type ChunithmCatalogSnapshot,
} from '@/domain/chunithm';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
import { ResourceService } from '@/services/resource-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

export const CHUNITHM_CATALOG_SCHEMA_VERSION = 2;
export const CHUNITHM_ALIAS_SCHEMA_VERSION = 1;
export const CHUNITHM_CATALOG_QUERY_KEY = [
  'chunithm-catalog',
  CHUNITHM_CATALOG_SCHEMA_VERSION,
] as const;

const repository = new SqliteSnapshotRepository();
const provider = new ChunithmCatalogProvider();

export function loadChunithmCatalog(): Promise<ChunithmCatalogSnapshot> {
  return new ResourceService(repository).load(
    CHUNITHM_CATALOG_RESOURCE_KEY,
    CHUNITHM_CATALOG_SCHEMA_VERSION,
    () => provider.getCatalog(),
  );
}

export function loadChunithmAliases(): Promise<ChunithmAliasSnapshot> {
  return new ResourceService(repository).load(
    CHUNITHM_ALIAS_RESOURCE_KEY,
    CHUNITHM_ALIAS_SCHEMA_VERSION,
    () => provider.getAliases(),
  );
}
