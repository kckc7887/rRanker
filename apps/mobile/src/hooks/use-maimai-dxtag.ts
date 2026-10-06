import { useQuery } from '@tanstack/react-query';
import type { ChartType } from '@/domain/models';
import {
  maimaiDxTagChartId,
  maimaiDxTagScoresForDifficulty,
  type MaimaiDxTagScores,
} from '@/providers/maimai-dxtag';
import { loadCachedMaimaiDxTag } from '@/services/maimai-dxtag-cache';

export function useMaimaiDxTagScores(
  songId: string,
  chartType: ChartType,
  levelIndex: number,
): MaimaiDxTagScores | null {
  const chartId = maimaiDxTagChartId(songId, chartType);
  const query = useQuery({
    enabled: chartId !== null,
    queryKey: ['maimai-dxtag', chartId],
    queryFn: ({ signal }) => chartId === null ? null : loadCachedMaimaiDxTag(chartId, signal),
    staleTime: Infinity,
    retry: false,
  });
  if (!query.data) return null;
  return maimaiDxTagScoresForDifficulty(query.data, levelIndex);
}
