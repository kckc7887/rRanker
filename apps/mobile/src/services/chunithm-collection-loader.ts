import {
  type ChunithmCollectionKind,
  type ChunithmCollectionListSnapshot,
} from '@/domain/chunithm-collections';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
const provider = new ChunithmCatalogProvider();

export function loadChunithmCollections(
  kind: ChunithmCollectionKind,
): Promise<ChunithmCollectionListSnapshot> {
  return provider.getCollections(kind);
}
