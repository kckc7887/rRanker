import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { requireDetailedCatalogProvider } from '@/providers/contracts';

export function useCollections() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['collections', activeAccountId, activeGameId];
  return useQuery({
    enabled: activeGameId === 'maimai' && provider !== null,
    queryKey,
    queryFn: () => requireDetailedCatalogProvider(provider).getCollections(),
  });
}
