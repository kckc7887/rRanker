import { sharedProvider, phigrosCatalogOptions, type PhigrosCatalogData } from '@/services/phigros-catalog-query';
import { useMemo } from 'react';
import { staleCached } from '@/services/cache-first';

import type { CatalogSnapshot } from '@/domain/models';
import { type PhigrosKyouAliasesSnapshot } from '@/domain/phigros-kyou';

import { useAliasedCatalog } from '@/hooks/use-aliased-catalog';



import { useCachedTabActive } from '@/components/CachedTabScreen';
import { queryClient } from '@/state/query-client';

export function usePhigrosCatalog(enabled = true) {
  const tabActive = useCachedTabActive();
  const provider = sharedProvider;
  const query = useAliasedCatalog<CatalogSnapshot, PhigrosKyouAliasesSnapshot, PhigrosCatalogData>(
    phigrosCatalogOptions(queryClient, provider, enabled && tabActive),
  );
  const data = useMemo(() => query.isError && query.data ? {
    ...query.data, snapshot: { ...query.data.snapshot, source: staleCached(query.data.snapshot.source) },
  } : query.data, [query.data, query.isError]);
  return { ...query, data, isError: query.isError && !data };
}
