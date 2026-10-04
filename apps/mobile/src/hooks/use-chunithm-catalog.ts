import { chunithmCatalogOptions } from '@/services/chunithm-catalog-query';
import { type ChunithmAliasSnapshot, type ChunithmCatalogSnapshot } from '@/domain/chunithm';

import { useAliasedCatalog } from '@/hooks/use-aliased-catalog';

import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';


import { useCachedTabActive } from '@/components/CachedTabScreen';

export function useChunithmCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  return useAliasedCatalog<ChunithmCatalogSnapshot, ChunithmAliasSnapshot>(
    chunithmCatalogOptions(queryClient, enabled && tabActive && activeGameId === 'chunithm'),
  );
}
