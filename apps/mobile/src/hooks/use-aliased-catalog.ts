import { useQuery } from '@tanstack/react-query';
import type { DataSource } from '@/domain/models';
import { loadAliasedCatalog, type AliasedCatalogOptions } from '@/services/aliased-catalog-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';

export function useAliasedCatalog<TCatalog extends { source: DataSource }, TAlias extends { source: DataSource }, TData = TCatalog>(
  options: AliasedCatalogOptions<TCatalog, TAlias, TData>,
) {
  const tabActive = useCachedTabActive();
  return useQuery({
    enabled: options.enabled,
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
