import {
  CHUNITHM_COLLECTION_LIST_RESOURCE_KEY,
  type ChunithmCollectionKind,
  type ChunithmCollectionListSnapshot,
} from '@/domain/chunithm-collections';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
const provider = new ChunithmCatalogProvider();

export function chunithmCollectionListResourceKey(kind: ChunithmCollectionKind): string {
  return `${CHUNITHM_COLLECTION_LIST_RESOURCE_KEY}:${kind}`;
}

export function loadChunithmCollections(
  kind: ChunithmCollectionKind,
): Promise<ChunithmCollectionListSnapshot> {
  return provider.getCollections(kind);
}
