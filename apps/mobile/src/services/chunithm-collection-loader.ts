import {
  CHUNITHM_COLLECTION_LIST_RESOURCE_KEY,
  CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION,
  type ChunithmCollectionKind,
  type ChunithmCollectionListSnapshot,
} from '@/domain/chunithm-collections';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
import { ResourceService } from '@/services/resource-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();
const provider = new ChunithmCatalogProvider();

export function chunithmCollectionListResourceKey(kind: ChunithmCollectionKind): string {
  return `${CHUNITHM_COLLECTION_LIST_RESOURCE_KEY}:${kind}`;
}

export function loadChunithmCollections(
  kind: ChunithmCollectionKind,
): Promise<ChunithmCollectionListSnapshot> {
  return new ResourceService(repository).load(
    chunithmCollectionListResourceKey(kind),
    CHUNITHM_COLLECTION_LIST_SCHEMA_VERSION,
    () => provider.getCollections(kind),
  );
}
