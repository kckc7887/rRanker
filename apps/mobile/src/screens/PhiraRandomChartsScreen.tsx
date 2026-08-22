import { useMemo, useState } from 'react';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { PhiraScoreCard } from '@/components/phira/PhiraScoreCard';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { phiraPlayerIdFromAccountId } from '@/domain/bound-account';
import { pickRandomItems, type RandomChartsCount } from '@/domain/random-charts';
import type { PhiraQueriedBest } from '@/domain/phira';
import { filterPhiraBests } from '@/domain/phira-filters';
import { usePhiraBests } from '@/hooks/use-phira';
import { useSession } from '@/state/session-store';
import { usePhiraRecordsFilter } from '@/state/phira-records-filter';

export function PhiraRandomChartsScreen() {
  const id = phiraPlayerIdFromAccountId(useSession((state) => state.activeAccountId));
  const query = usePhiraBests(id); const [count, setCount] = useState<RandomChartsCount>(1); const [results, setResults] = useState<PhiraQueriedBest[]>([]); const [drawn, setDrawn] = useState(false);
  const filter = usePhiraRecordsFilter();
  const pool = useMemo(() => filterPhiraBests(Object.values(query.data?.items ?? {}), filter), [filter, query.data?.items]);
  const draw = () => { setResults(pickRandomItems(pool, count, `${Date.now()}-${Math.random()}`)); setDrawn(true); };
  return <RandomChartsPage count={count} onCountChange={setCount} filter={
    <PhigrosFilterBar collapsible={false} showLevel={false} level="all" onLevelChange={() => undefined}
      collapsed={false} onCollapsedChange={() => undefined}
      constantMin={filter.constantMin} constantMax={filter.constantMax}
      accuracyMin={filter.accuracyMin} accuracyMax={filter.accuracyMax}
      rank={filter.rank} xing={filter.xing} onConstantMinChange={filter.setConstantMin}
      onConstantMaxChange={filter.setConstantMax} onAccuracyMinChange={filter.setAccuracyMin}
      onAccuracyMaxChange={filter.setAccuracyMax} onRankChange={filter.setRank}
      onXingChange={filter.setXing} onReset={filter.clearFilters} />}
    poolSize={pool.length} onDraw={draw} hasDrawn={drawn} resultCount={results.length} results={results.map((item) => <PhiraScoreCard key={item.chart.id} item={item} />)}
    emptyMessage="没有可抽取的歌曲" drawDisabled={!pool.length} poolError={query.error ? '无法读取成绩，请重试。' : null} onRetryPool={() => void query.refetch()} />;
}
