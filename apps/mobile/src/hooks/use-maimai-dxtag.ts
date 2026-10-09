import { useQuery } from '@tanstack/react-query';
import type { ChartType } from '@/domain/models';
import {
  maimaiDxTagChartId, maimaiDxTagScoresForDifficulty, type MaimaiDxTagScores,
} from '@/domain/maimai-dxtag';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { loadCachedMaimaiDxTag } from '@/services/maimai-dxtag-cache';

export function useMaimaiDxTag(enabled = true) {
  const active = useCachedTabActive();
  const { foregroundReady } = useAppLifecycle();
  const catalog = useDetailedCatalog(enabled);
  return useQuery({
    enabled: enabled && active && foregroundReady && !!catalog.data,
    notifyOnChangeProps: active ? undefined : [],
    queryKey: ['maimai-dxtag', 'all', catalog.data?.source.updatedAt],
    queryFn: ({ signal }) => loadCachedMaimaiDxTag(catalog.data!, signal),
    staleTime: query => query.state.data?.coversCatalog ? Infinity : 0,
    retry: false,
  });
}

export function useMaimaiDxTagScores(
  songId: string, chartType: ChartType, levelIndex: number,
): MaimaiDxTagScores | null {
  const chartId = maimaiDxTagChartId(songId, chartType);
  const query = useMaimaiDxTag(chartId !== null);
  const charts = chartId === null ? undefined : query.data?.library[chartId];
  return charts ? maimaiDxTagScoresForDifficulty(charts, levelIndex) : null;
}
