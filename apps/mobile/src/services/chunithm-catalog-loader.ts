import {
  type ChunithmAliasSnapshot,
  type ChunithmCatalogSnapshot,
} from '@/domain/chunithm';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';

export const CHUNITHM_CATALOG_SCHEMA_VERSION = 2;
export const CHUNITHM_ALIAS_SCHEMA_VERSION = 1;
export const CHUNITHM_CATALOG_QUERY_KEY = [
  'chunithm-catalog',
  CHUNITHM_CATALOG_SCHEMA_VERSION,
] as const;

const provider = new ChunithmCatalogProvider();

export function loadChunithmCatalog(): Promise<ChunithmCatalogSnapshot> {
  return provider.getCatalog();
}

export function loadChunithmAliases(): Promise<ChunithmAliasSnapshot> {
  return provider.getAliases();
}
