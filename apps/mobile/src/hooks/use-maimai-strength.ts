import { useMemo } from 'react';
import { chartVersionKey } from '@/domain/catalog';
import {
  maimaiDxTagChartId, maimaiDxTagScoresForDifficulty,
  type MaimaiDxTagScores,
} from '@/domain/maimai-dxtag';
import { analyzeMaimaiStrength, buildMaimaiStrengthPool } from '@/domain/maimai-strength-analysis';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useMaimaiDxTag } from '@/hooks/use-maimai-dxtag';

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
  const dxTag = useMaimaiDxTag(enabled && charts.length > 0);
  const features = new Map<string, MaimaiDxTagScores>();
  for (const chart of charts) {
    const id = maimaiDxTagChartId(chart.songId, chart.type);
    const rows = id === null ? undefined : dxTag.data?.library[id];
    const value = rows ? maimaiDxTagScoresForDifficulty(rows, chart.levelIndex) : null;
    if (value) features.set(chartVersionKey(chart.songId, chart.type, chart.levelIndex), value);
  }
  const analysis = catalog.data && scores.data
    ? analyzeMaimaiStrength(catalog.data, scores.data.records, features) : undefined;
  return {
    analysis, hasFeatureError: dxTag.isError || !!dxTag.data?.source.isStale,
    retryFailed: () => { void dxTag.refetch(); },
    pending: charts.length > 0 && dxTag.isFetching,
    isLoading: scores.isLoading || catalog.isLoading,
    isError: scores.isError || catalog.isError,
    isStale: scores.isDataStale || catalog.data?.source.isStale || dxTag.data?.source.isStale,
    retry: () => { void scores.refetch(); void catalog.refetch(); },
  };
}
