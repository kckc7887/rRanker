import { useQuery } from '@tanstack/react-query';
import {
  DXRATING_CHART_TAGS_RESOURCE_KEY,
} from '@/domain/dxrating-chart-tags';
import { DxRatingChartTagsProvider } from '@/providers/dxrating-chart-tags-provider';
import { ProviderError } from '@/providers/errors';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
const provider = new DxRatingChartTagsProvider();

export function useDxRatingChartTags(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  return useQuery({
    enabled: enabled && tabActive && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID,
    queryKey: [DXRATING_CHART_TAGS_RESOURCE_KEY],
    queryFn: ({ signal }) => provider.getChartTags(signal),
    staleTime: 60 * 60 * 1000,
    gcTime: Infinity,
    placeholderData: (previous) => previous,
    retry: (failureCount, error) =>
      error instanceof ProviderError && error.code === 'upstream_schema' ? false : failureCount < 1,
  });
}
