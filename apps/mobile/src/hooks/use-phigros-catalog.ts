import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CatalogSnapshot } from '@/domain/models';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';
import { useSession } from '@/state/session-store';

export function usePhigrosCatalog() {
  const provider = useMemo(() => new PhigrosCatalogProvider(), []);
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: activeGameId === 'phigros',
    queryKey: ['phigros-catalog'],
    queryFn: async (): Promise<{ snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider }> => {
      provider.resetCatalogCache();
      const snapshot = await provider.getCatalog();
      return { snapshot, provider };
    },
  });
}
