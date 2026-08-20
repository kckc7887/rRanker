import { useQuery } from '@tanstack/react-query';
import {
  DXRATING_CHART_TAGS_RESOURCE_KEY,
  DXRATING_CHART_TAGS_SCHEMA_VERSION,
} from '@/domain/dxrating-chart-tags';
import { DxRatingChartTagsProvider } from '@/providers/dxrating-chart-tags-provider';
import { ResourceService } from '@/services/resource-service';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();
const provider = new DxRatingChartTagsProvider();

export function useDxRatingChartTags(enabled = true) {
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  return useQuery({
    enabled: enabled && activeGameId === 'maimai' && activeAccountId !== UNBOUND_ACCOUNT_ID,
    queryKey: [DXRATING_CHART_TAGS_RESOURCE_KEY],
    queryFn: () => new ResourceService(repository).load(
      DXRATING_CHART_TAGS_RESOURCE_KEY,
      DXRATING_CHART_TAGS_SCHEMA_VERSION,
      () => provider.getChartTags(),
    ),
    staleTime: 60 * 60 * 1000,
  });
}
