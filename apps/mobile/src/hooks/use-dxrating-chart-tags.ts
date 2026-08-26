import { useQuery } from '@tanstack/react-query';
import {
  DXRATING_CHART_TAGS_RESOURCE_KEY,
  DXRATING_CHART_TAGS_SCHEMA_VERSION,
  type DxRatingChartTagsSnapshot,
} from '@/domain/dxrating-chart-tags';
import { DxRatingChartTagsProvider } from '@/providers/dxrating-chart-tags-provider';
import { ResourceService } from '@/services/resource-service';
import { cacheFirstLoad } from '@/services/cache-first';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { queryClient } from '@/state/query-client';

const repository = new SqliteSnapshotRepository();
const resourceService = new ResourceService(repository);
const provider = new DxRatingChartTagsProvider();

export function useDxRatingChartTags(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  return useQuery({
    enabled: enabled && tabActive && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID,
    queryKey: [DXRATING_CHART_TAGS_RESOURCE_KEY],
    queryFn: () => cacheFirstLoad<DxRatingChartTagsSnapshot>({
      loadCached: () => resourceService.getCached<DxRatingChartTagsSnapshot>(
        DXRATING_CHART_TAGS_RESOURCE_KEY,
        DXRATING_CHART_TAGS_SCHEMA_VERSION,
      ),
      loadFresh: () => resourceService.load(
        DXRATING_CHART_TAGS_RESOURCE_KEY,
        DXRATING_CHART_TAGS_SCHEMA_VERSION,
        () => provider.getChartTags(),
      ),
      onFresh: (fresh) => {
        queryClient.setQueryData([DXRATING_CHART_TAGS_RESOURCE_KEY], fresh);
      },
    }),
    staleTime: 60 * 60 * 1000,
  });
}
