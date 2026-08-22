import { useQuery } from '@tanstack/react-query';
import {
  DXRATING_CHART_TAGS_RESOURCE_KEY,
} from '@/domain/dxrating-chart-tags';
import { DxRatingChartTagsProvider } from '@/providers/dxrating-chart-tags-provider';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
const provider = new DxRatingChartTagsProvider();

export function useDxRatingChartTags(enabled = true) {
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  return useQuery({
    enabled: enabled && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID,
    queryKey: [DXRATING_CHART_TAGS_RESOURCE_KEY],
    queryFn: () => provider.getChartTags(),
    staleTime: 60 * 60 * 1000,
  });
}
