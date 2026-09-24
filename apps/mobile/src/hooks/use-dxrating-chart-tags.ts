import { useQuery } from '@tanstack/react-query';
import {
  DXRATING_CHART_TAGS_RESOURCE_KEY,
} from '@/domain/dxrating-chart-tags';
import { DxRatingChartTagsProvider } from '@/providers/dxrating-chart-tags-provider';
import { ProviderError } from '@/providers/errors';
import { useSession } from '@/state/session-store';
import { useCachedTabActive } from '@/components/CachedTabScreen';
const provider = new DxRatingChartTagsProvider();

// 标签数据禁止缓存：不落盘、不复用旧快照；失败只走自动重试，不设手动重试入口。
const DXRATING_TAGS_MAX_AUTO_RETRIES = 3;
const DXRATING_TAGS_ERROR_POLL_INTERVAL_MS = 30_000;

export function useDxRatingChartTags(enabled = true) {
  const tabActive = useCachedTabActive();
  const activeGameId = useSession((state) => state.activeGameId);
  const active = enabled && tabActive && activeGameId === 'maimai';
  return useQuery({
    enabled: active,
    queryKey: [DXRATING_CHART_TAGS_RESOURCE_KEY],
    queryFn: ({ signal }) => provider.getChartTags(signal),
    staleTime: 0,
    gcTime: 0,
    retry: (failureCount, error) => {
      if (error instanceof ProviderError && !error.retryable) return false;
      return failureCount < DXRATING_TAGS_MAX_AUTO_RETRIES;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
    refetchOnMount: 'always',
    refetchInterval: (query) => (active && query.state.status === 'error'
      ? DXRATING_TAGS_ERROR_POLL_INTERVAL_MS
      : false),
  });
}
