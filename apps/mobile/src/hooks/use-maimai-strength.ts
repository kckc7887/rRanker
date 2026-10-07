import { useMemo } from 'react';
import { chartVersionKey } from '@/domain/catalog';
import {
  maimaiDxTagChartId, maimaiDxTagScoresForDifficulty,
  type MaimaiDxTagScores,
} from '@/domain/maimai-dxtag';
import { analyzeMaimaiStrength, buildMaimaiStrengthPool } from '@/domain/maimai-strength-analysis';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useBoundedQueries } from '@/hooks/use-bounded-queries';
import { loadCachedMaimaiDxTag } from '@/services/maimai-dxtag-cache';

export function useMaimaiStrength(enabled: boolean) {
  const scores = useScoreSnapshot(enabled);
  const catalog = useDetailedCatalog(enabled);
  const pool = useMemo(() => catalog.data && scores.data
    ? buildMaimaiStrengthPool(catalog.data, scores.data.records) : undefined,
  [catalog.data, scores.data]);
  const charts = useMemo(() => {
    const unique = new Map<string, { songId: string; type: 'SD' | 'DX' | 'UTAGE'; levelIndex: number }>();
    for (const chart of [...(pool?.played ?? []), ...(pool?.candidates ?? [])]) {
      unique.set(chartVersionKey(chart.songId, chart.type, chart.levelIndex), chart);
    }
    return [...unique.values()];
  }, [pool]);
  const ids = useMemo(() => [...new Set(charts.flatMap(chart => {
    const id = maimaiDxTagChartId(chart.songId, chart.type);
    return id === null ? [] : [id];
  }))], [charts]);
  const definitions = useMemo(() => ids.map(id => ({
    queryKey: ['maimai-dxtag', id] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => loadCachedMaimaiDxTag(id, signal),
    staleTime: Infinity, retry: false,
  })), [ids]);
  const { queries, retryFailed } = useBoundedQueries(definitions, 4, enabled, false);
  const byId = new Map(ids.map((id, index) => [id, queries[index]]));
  const features = new Map<string, MaimaiDxTagScores>();
  for (const chart of charts) {
    const id = maimaiDxTagChartId(chart.songId, chart.type);
    const query = id === null ? undefined : byId.get(id);
    if (!query?.isSuccess) continue;
    const value = query.data ? maimaiDxTagScoresForDifficulty(query.data, chart.levelIndex) : null;
    if (value) features.set(chartVersionKey(chart.songId, chart.type, chart.levelIndex), value);
  }
  const completed = queries.filter(query => query.isSuccess || query.isError).length;
  const failed = queries.filter(query => query.isError).length;
  const analysis = catalog.data && scores.data
    ? analyzeMaimaiStrength(catalog.data, scores.data.records, features) : undefined;
  return {
    analysis, hasFeatureError: failed > 0, retryFailed,
    pending: completed < ids.length,
    isLoading: scores.isLoading || catalog.isLoading,
    isError: scores.isError || catalog.isError,
    isStale: scores.isDataStale || catalog.data?.source.isStale,
    retry: () => { void scores.refetch(); void catalog.refetch(); },
  };
}
