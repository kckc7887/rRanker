import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CatalogSnapshot } from '@/domain/models';
import { PhigrosCatalogProvider } from '@/providers/phigros-catalog-provider';

export function usePhigrosCatalog() {
  const provider = useMemo(() => new PhigrosCatalogProvider(), []);
  return useQuery({
    queryKey: ['phigros-catalog'],
    queryFn: async (): Promise<{ snapshot: CatalogSnapshot; provider: PhigrosCatalogProvider }> => {
      const snapshot = await provider.getCatalog();
      return { snapshot, provider };
    },
  });
}
