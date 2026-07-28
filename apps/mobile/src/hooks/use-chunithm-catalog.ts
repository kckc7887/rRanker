import { useQuery } from '@tanstack/react-query';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import {
  CHUNITHM_CATALOG_QUERY_KEY,
  loadChunithmCatalog,
} from '@/services/chunithm-catalog-loader';
import { useSession } from '@/state/session-store';

export function useChunithmCatalog() {
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: activeGameId === 'chunithm',
    queryKey: CHUNITHM_CATALOG_QUERY_KEY,
    queryFn: (): Promise<ChunithmCatalogSnapshot> => loadChunithmCatalog(),
  });
}
