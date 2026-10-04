import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { requireDetailedCatalogProvider } from '@/providers/contracts';

export function usePlates(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const provider = useSession((state) => state.catalogProvider);
  const queryKey = ['plates', activeAccountId, activeGameId];
  return useQuery({
    enabled: enabled && tabActive && activeGameId === 'maimai' && provider !== null,
    notifyOnChangeProps: tabActive ? undefined : [],
    queryKey,
    queryFn: () => requireDetailedCatalogProvider(provider).getPlates(),
  });
}
