import { useQuery } from '@tanstack/react-query';
import type { DataSource } from '@rranker/sdk/data';
import { loadAliasedCatalog, type AliasedCatalogOptions } from '@rranker/sdk/services/aliased-catalog-query';
import { useCachedTabActive } from '@rranker/sdk/components/CachedTabScreen';

export function useAliasedCatalog<TCatalog extends { source: DataSource }, TAlias extends { source: DataSource }, TData = TCatalog>(
  options: AliasedCatalogOptions<TCatalog, TAlias, TData>,
) {
  const tabActive = useCachedTabActive();
  return useQuery({
    enabled: options.enabled,
    meta: options.meta,
    notifyOnChangeProps: tabActive ? undefined : [],
    retry: options.retry,
    queryKey: options.queryKey,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => loadAliasedCatalog(options, signal),
  });
}
