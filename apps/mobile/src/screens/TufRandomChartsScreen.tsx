import { useEffect, useMemo, useState } from 'react';
import { TufRandomFilterBar, type TufDifficultyBand, type TufPassAchievementFilter } from '@/components/adofai/TufFilterBar';
import { TufScoreCard } from '@/components/adofai/TufScoreCard';
import { QueryStateView } from '@/components/QueryStateView';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import { pickRandomItems, type RandomChartsCount } from '@/domain/random-charts';
import { filterTufPasses, tufDifficultyBounds, uniqueTufPassesByLevel, type TufPass } from '@/domain/tuf';
import { useTufPasses } from '@/hooks/use-tuf';
import { useSession } from '@/state/session-store';

export function TufRandomChartsScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const playerId = tufPlayerIdFromAccountId(accountId);
  const query = useTufPasses(playerId, { sortBy: 'impact', order: 'DESC', bestPerLevel: true });
  const [count, setCount] = useState<RandomChartsCount>(1);
  const [expanded, setExpanded] = useState(false);
  const [difficultyBand, setDifficultyBand] = useState<TufDifficultyBand>('all');
  const [difficultyMin, setDifficultyMin] = useState('');
  const [difficultyMax, setDifficultyMax] = useState('');
  const [includeSpecial, setIncludeSpecial] = useState(true);
  const [achievement, setAchievement] = useState<TufPassAchievementFilter>('all');
  const [results, setResults] = useState<TufPass[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  const fetchNextPage = query.fetchNextPage;
  useEffect(() => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [fetchNextPage, query.hasNextPage, query.isFetchNextPageError, query.isFetchingNextPage]);

  const loaded = useMemo(() => uniqueTufPassesByLevel(
    query.data?.pages.flatMap((page) => page.passes) ?? [],
  ), [query.data?.pages]);
  const pool = useMemo(() => filterTufPasses(loaded, {
    band: difficultyBand,
    ...tufDifficultyBounds(difficultyMin, difficultyMax),
    includeSpecial,
  }, achievement), [achievement, difficultyBand, difficultyMax, difficultyMin, includeSpecial, loaded]);
  const loading = query.isLoading || query.hasNextPage === true || query.isFetchingNextPage;

  const draw = () => {
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomItems(pool, count, seed));
  };

  return <QueryStateView<TufPass[]>
    data={!loading && loaded.length ? loaded : undefined}
    error={query.error}
    isEmpty={!loading && playerId !== null && loaded.length === 0}
    isError={query.isError || query.isFetchNextPageError}
    isLoading={loading}
    emptyText={playerId === null ? '请先绑定 TUF 玩家' : '当前没有公开成绩'}
    onRetry={() => void query.refetch()}
    renderData={() => <RandomChartsPage
      count={count}
      emptyMessage="没有符合条件的公开成绩，请放宽筛选后再试。"
      filter={<TufRandomFilterBar
        achievement={achievement} difficultyBand={difficultyBand} difficultyMax={difficultyMax}
        difficultyMin={difficultyMin} expanded={expanded} includeSpecial={includeSpecial}
        onAchievementChange={setAchievement} onDifficultyBandChange={setDifficultyBand}
        onDifficultyMaxChange={setDifficultyMax} onDifficultyMinChange={setDifficultyMin}
        onExpandedChange={setExpanded} onIncludeSpecialChange={setIncludeSpecial}
        onReset={() => {
          setDifficultyBand('all'); setDifficultyMin(''); setDifficultyMax('');
          setIncludeSpecial(true); setAchievement('all');
        }} />}
      hasDrawn={results !== null}
      onCountChange={setCount}
      onDraw={draw}
      poolSize={pool.length}
      resultCount={results?.length ?? 0}
      results={results?.map((pass) => <TufScoreCard key={`${lastSeed}-${pass.id}`} pass={pass} />)}
      sourceItems={[{ key: 'scores', label: 'TUF 公开成绩', state: 'live' }]}
    />}
  />;
}
