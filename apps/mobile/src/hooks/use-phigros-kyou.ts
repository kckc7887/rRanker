import { useQuery } from '@tanstack/react-query';
import {
  PHIGROS_KYOU_TAGS_RESOURCE_KEY,
} from '@/domain/phigros-kyou';
import { PhigrosKyouProvider } from '@/providers/phigros-kyou-provider';
import { useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { PHIGROS_KYOU_STALE_TIME_MS } from '@/services/phigros-kyou-cache';

export { loadPhigrosKyouAliases, resetPhigrosKyouAliasesCache } from '@/services/phigros-kyou-cache';

const provider = new PhigrosKyouProvider();

export function usePhigrosKyouChartTags(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  return useQuery({
    enabled: enabled && tabActive && activeGameId === 'phigros',
    queryKey: [PHIGROS_KYOU_TAGS_RESOURCE_KEY],
    queryFn: ({ signal }) => provider.getChartTags(signal),
    staleTime: PHIGROS_KYOU_STALE_TIME_MS,
  });
}
