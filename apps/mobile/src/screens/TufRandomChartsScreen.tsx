import { useEffect, useMemo, useState } from 'react';
import { TufRandomFilterBar } from '@/components/adofai/TufFilterBar';
import { TufScoreCard } from '@/components/adofai/TufScoreCard';
import { QueryStateView } from '@/components/QueryStateView';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { tufPlayerIdFromAccountId } from '@/domain/bound-account';
import { pickRandomItems } from '@/domain/random-charts';
import { filterTufPasses, tufDifficultyBounds, uniqueTufPassesByLevel, type TufPass } from '@/domain/tuf';
import { prefetchTufPassPage, useTufPasses } from '@/hooks/use-tuf';
import { loadOffsetPagesBounded, offsetPageStarts } from '@/services/offset-pagination';
import { useTufRandomChartsFilter } from '@/state/tuf-random-charts-filter';
import { useSession } from '@/state/session-store';

export function TufRandomChartsScreen() {
  const accountId = useSession((state) => state.activeAccountId);
  const playerId = tufPlayerIdFromAccountId(accountId);
  const queryOptions = useMemo(() => ({ sortBy: 'impact' as const, order: 'DESC' as const, bestPerLevel: true }), []);
  const query = useTufPasses(playerId, queryOptions);
  const {
    count, collapsed, difficultyBand, difficultyMin, difficultyMax, includeSpecial,
    achievement, hydrate, setCount, setCollapsed, setDifficultyBand, setDifficultyMin,
    setDifficultyMax, setIncludeSpecial, setAchievement, clearFilters,
  } = useTufRandomChartsFilter();
  const [results, setResults] = useState<TufPass[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);
  const [failedOffsets, setFailedOffsets] = useState<number[]>([]);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const firstPage = query.data?.pages[0];
  useEffect(() => {
    if (playerId === null || !firstPage) return;
    const controller = new AbortController();
    const loadedOffsets = new Set((query.data?.pages ?? []).map((page) => page.offset));
    const offsets = (failedOffsets.length > 0 ? failedOffsets : offsetPageStarts(firstPage.total, firstPage.limit))
      .filter((offset) => !loadedOffsets.has(offset));
    setFailedOffsets([]);
    void loadOffsetPagesBounded({
      offsets,
      concurrency: 3,
      loadPage: (offset) => prefetchTufPassPage(playerId, queryOptions, offset),
      signal: controller.signal,
    }).then((failures) => {
      if (!controller.signal.aborted) setFailedOffsets(failures.map((failure) => failure.offset));
    });
    return () => controller.abort();
    // retryVersion is the explicit trigger for retrying only the failed offsets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstPage?.limit, firstPage?.total, playerId, queryOptions, retryVersion]);

  const loaded = useMemo(() => uniqueTufPassesByLevel(
    query.data?.pages.flatMap((page) => page.passes) ?? [],
  ), [query.data?.pages]);
  const pool = useMemo(() => filterTufPasses(loaded, {
    band: difficultyBand,
    ...tufDifficultyBounds(difficultyMin, difficultyMax),
    includeSpecial,
  }, achievement), [achievement, difficultyBand, difficultyMax, difficultyMin, includeSpecial, loaded]);
  const expectedOffsets = firstPage ? offsetPageStarts(firstPage.total, firstPage.limit) : [];
  const loadedOffsets = new Set((query.data?.pages ?? []).map((page) => page.offset));
  const complete = !!firstPage && expectedOffsets.every((offset) => loadedOffsets.has(offset)) && failedOffsets.length === 0;
  const loadedCount = query.data?.pages.reduce((sum, page) => sum + page.passes.length, 0) ?? 0;
  const loading = query.isLoading;

  const draw = () => {
    if (!complete) return;
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
      drawDisabled={!complete}
      emptyMessage="没有符合条件的公开成绩，请放宽筛选后再试。"
      filter={<TufRandomFilterBar
        achievement={achievement} difficultyBand={difficultyBand} difficultyMax={difficultyMax}
        difficultyMin={difficultyMin} expanded={!collapsed} includeSpecial={includeSpecial}
        onAchievementChange={setAchievement} onDifficultyBandChange={setDifficultyBand}
        onDifficultyMaxChange={setDifficultyMax} onDifficultyMinChange={setDifficultyMin}
        onExpandedChange={(value) => setCollapsed(!value)} onIncludeSpecialChange={setIncludeSpecial}
        onReset={clearFilters} />}
      hasDrawn={results !== null}
      onCountChange={setCount}
      onDraw={draw}
      poolSize={pool.length}
      poolStatus={complete
        ? `候选谱面 ${pool.length} 条`
        : `正在加载完整随机池 · 已加载 ${Math.min(loadedCount, firstPage?.total ?? loadedCount)}/${firstPage?.total ?? '—'}`}
      poolError={failedOffsets.length > 0 ? `有 ${failedOffsets.length} 页公开成绩加载失败，完整随机池尚不可用。` : null}
      onRetryPool={failedOffsets.length > 0 ? () => setRetryVersion((value) => value + 1) : undefined}
      resultCount={results?.length ?? 0}
      results={results?.map((pass) => <TufScoreCard key={`${lastSeed}-${pass.id}`} pass={pass} />)}
    />}
  />;
}
