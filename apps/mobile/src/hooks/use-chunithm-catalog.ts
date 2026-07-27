import { useQuery } from '@tanstack/react-query';
import {
  CHUNITHM_CATALOG_RESOURCE_KEY,
  type ChunithmCatalogSnapshot,
} from '@/domain/chunithm';
import { ChunithmCatalogProvider } from '@/providers/chunithm-catalog-provider';
import { ResourceService } from '@/services/resource-service';
import { useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const CHUNITHM_CATALOG_SCHEMA_VERSION = 1;
const repository = new SqliteSnapshotRepository();
const provider = new ChunithmCatalogProvider();

export function useChunithmCatalog() {
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: activeGameId === 'chunithm',
    queryKey: ['chunithm-catalog', CHUNITHM_CATALOG_SCHEMA_VERSION],
    queryFn: (): Promise<ChunithmCatalogSnapshot> => (
      new ResourceService(repository).load(
        CHUNITHM_CATALOG_RESOURCE_KEY,
        CHUNITHM_CATALOG_SCHEMA_VERSION,
        () => provider.getCatalog(),
      )
    ),
  });
}
