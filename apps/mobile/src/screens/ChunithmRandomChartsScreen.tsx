import { useEffect, useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { ChunithmDifficultyBadge } from '@/components/chunithm/ChunithmDifficultyBadge';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { QueryStateView } from '@/components/QueryStateView';
import {
  RandomChartsPage,
  RandomUnplayedChartCard,
} from '@/components/RandomChartsPage';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import {
  chunithmRandomChartKey,
  filterChunithmRandomCharts,
  type ChunithmRandomChartPick,
} from '@/domain/chunithm-random-charts';
import { buildChunithmScoreCards } from '@/domain/chunithm-score-presentation';
import { pickRandomItems } from '@/domain/random-charts';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useGameData } from '@/hooks/use-game-data';
import { useChunithmRandomChartsFilter } from '@/state/chunithm-random-charts-filter';

export function ChunithmRandomChartsScreen() {
  const catalogQuery = useChunithmCatalog();
  const gameData = useGameData();
  const {
    count, collapsed, difficulty, version, constantMin, constantMax, rankMin, rankMax,
    hydrate, setCount, setCollapsed, setDifficulty, setVersion, setConstantMin,
    setConstantMax, setRankMin, setRankMax, clearFilters,
  } = useChunithmRandomChartsFilter();
  const [results, setResults] = useState<ChunithmRandomChartPick[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const payload = gameData.data?.payload.kind === 'chunithm'
    ? gameData.data.payload
    : null;
  const scoreCards = useMemo(
    () => buildChunithmScoreCards(payload?.scores ?? [], catalogQuery.data),
    [catalogQuery.data, payload?.scores],
  );
  const filters = useMemo(() => ({
    difficulty,
    version,
    constantMin,
    constantMax,
    rankMin,
    rankMax,
  }), [constantMax, constantMin, difficulty, rankMax, rankMin, version]);
  const pool = useMemo(
    () => catalogQuery.data
      ? filterChunithmRandomCharts(catalogQuery.data, scoreCards, filters)
      : [],
    [catalogQuery.data, filters, scoreCards],
  );

  const draw = () => {
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomItems(pool, count, seed));
  };
  const openDetail = (pick: ChunithmRandomChartPick) => router.push({
    pathname: '/songs/[songId]',
    params: { songId: pick.songId, levelIndex: String(pick.levelIndex) },
  } as Href);

  return (
    <QueryStateView<ChunithmCatalogSnapshot>
      data={catalogQuery.data}
      error={catalogQuery.error}
      isEmpty={false}
      isError={catalogQuery.isError}
      isLoading={catalogQuery.isLoading}
      onRetry={() => {
        void catalogQuery.refetch();
        void gameData.refetch();
      }}
      renderData={(data) => (
        <RandomChartsPage
          count={count}
          emptyMessage="没有符合条件的中二谱面，请放宽筛选后再试。"
          filter={(
            <ChunithmFilterBar
              collapsed={collapsed}
              constantMax={constantMax}
              constantMin={constantMin}
              difficulty={difficulty}
              onCollapsedChange={setCollapsed}
              onConstantMaxChange={setConstantMax}
              onConstantMinChange={setConstantMin}
              onDifficultyChange={setDifficulty}
              onRankMaxChange={setRankMax}
              onRankMinChange={setRankMin}
              onReset={clearFilters}
              onVersionChange={setVersion}
              rankMax={rankMax}
              rankMin={rankMin}
              version={version}
              versions={data.versions}
            />
          )}
          hasDrawn={results !== null}
          onCountChange={setCount}
          onDraw={draw}
          poolSize={pool.length}
          resultCount={results?.length ?? 0}
          results={results?.map((pick) => {
            const key = `${lastSeed}-${chunithmRandomChartKey(pick)}`;
            return pick.record ? (
              <ChunithmScoreCard key={key} record={pick.record} />
            ) : (
              <RandomUnplayedChartCard
                badge={(
                  <ChunithmDifficultyBadge
                    constant={pick.difficultyConstant}
                    display={pick.levelIndex === 5 ? 'label-and-value' : 'constant'}
                    levelIndex={pick.levelIndex}
                    worldsEndLabel={pick.worldsEndLabel}
                  />
                )}
                key={key}
                onPress={() => openDetail(pick)}
                title={pick.title}
              />
            );
          })}
          sourceItems={[
            {
              key: 'catalog',
              label: data.source.label,
              updatedAt: data.source.updatedAt,
              state: data.source.isStale ? 'cache' : 'live',
            },
            {
              key: 'scores',
              label: payload?.source.label ?? '成绩不可用',
              updatedAt: payload?.source.updatedAt,
              state: !payload ? 'unavailable' : payload.source.isStale ? 'cache' : 'live',
            },
          ]}
        />
      )}
    />
  );
}
