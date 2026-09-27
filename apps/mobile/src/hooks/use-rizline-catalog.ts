import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { RIZLINE_CATALOG_QUERY_KEY, RIZLINE_CATALOG_QUERY_OPTIONS, applyRizlineCatalog } from '@/services/rizline-catalog-query';
import { useQuery } from '@tanstack/react-query';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { rizlineResources } from '@/services/rizline-resources';


import { queryClient } from '@/state/query-client';
export function useRizlineCatalog(enabled = true) {
  const active = useCachedTabActive();
  return useQuery({ queryKey: RIZLINE_CATALOG_QUERY_KEY, ...RIZLINE_CATALOG_QUERY_OPTIONS, enabled: enabled && active,
    queryFn: ({ signal }) => rizlineResources.load(signal, data => applyRizlineCatalog(queryClient, data, captureResourceWrites('rizline', signal))) });
}
