import { useEffect, useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import {
  RandomChartsPage,
  RandomUnplayedChartCard,
} from '@/components/RandomChartsPage';
import { QueryStateView } from '@/components/QueryStateView';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { chartVersionKey } from '@/domain/catalog';
import type { CatalogSnapshot } from '@/domain/models';
import {
  buildBestRecordMap,
  filterPhigrosRandomCharts,
  pickRandomItems,
  type RandomChartPick,
} from '@/domain/random-charts';
import { phigrosChartNoteKey } from '@/domain/phigros-xing';
import { buildPhigrosNoteTotalByKey } from '@/features/phigros-best-image/phigros-best-image-custom';
import { useGameData } from '@/hooks/use-game-data';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosRandomChartsFilter } from '@/state/phigros-random-charts-filter';

export function PhigrosRandomChartsScreen() {
  const catalogQuery = usePhigrosCatalog();
  const gameData = useGameData();
  const {
    count, collapsed, level, constantMin, constantMax, accuracyMin, accuracyMax, rank, xing, chapter,
    hydrate, setCount, setCollapsed, setLevel, setConstantMin, setConstantMax,
    setAccuracyMin, setAccuracyMax, setRank, setXing, setChapter, clearFilters,
  } = usePhigrosRandomChartsFilter();
  const [results, setResults] = useState<RandomChartPick[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const catalog = catalogQuery.data?.snapshot;
  const payload = gameData.data?.payload.kind === 'phigros' ? gameData.data.payload : null;
  const records = useMemo(() => payload?.records ?? [], [payload?.records]);
  const bestByChart = useMemo(() => buildBestRecordMap(records), [records]);
  const noteTotalByKey = useMemo(
    () => buildPhigrosNoteTotalByKey(catalog?.songs ?? []),
    [catalog?.songs],
  );
  const filters = useMemo(() => ({
    level,
    constantMin,
    constantMax,
    accuracyMin,
    accuracyMax,
    rank,
    xing,
    chapter,
  }), [accuracyMax, accuracyMin, chapter, constantMax, constantMin, level, rank, xing]);
  const pool = useMemo(
    () => catalog
      ? filterPhigrosRandomCharts(catalog, records, filters, noteTotalByKey)
      : [],
    [catalog, filters, noteTotalByKey, records],
  );

  const draw = () => {
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomItems(pool, count, seed));
  };
  const openDetail = (pick: RandomChartPick) => router.push({
    pathname: '/songs/[songId]',
    params: { songId: pick.songId, levelIndex: String(pick.levelIndex) },
  } as Href);

  return (
    <QueryStateView<CatalogSnapshot>
      data={catalog}
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
          emptyMessage="没有符合条件的谱面，请放宽筛选后再试。"
          filter={(
            <PhigrosFilterBar
              accuracyMax={accuracyMax}
              accuracyMin={accuracyMin}
              chapter={chapter}
              collapsed={collapsed}
              constantMax={constantMax}
              constantMin={constantMin}
              level={level}
              onAccuracyMaxChange={setAccuracyMax}
              onAccuracyMinChange={setAccuracyMin}
              onChapterChange={setChapter}
              onCollapsedChange={setCollapsed}
              onConstantMaxChange={setConstantMax}
              onConstantMinChange={setConstantMin}
              onLevelChange={setLevel}
              onRankChange={setRank}
              onReset={clearFilters}
              onXingChange={setXing}
              rank={rank}
              versions={data.versions}
              xing={xing}
            />
          )}
          hasDrawn={results !== null}
          onCountChange={setCount}
          onDraw={draw}
          poolSize={pool.length}
          resultCount={results?.length ?? 0}
          results={results?.map((pick) => {
            const key = `${lastSeed}-${chartVersionKey(pick.songId, pick.type, pick.levelIndex)}`;
            const record = bestByChart.get(
              chartVersionKey(pick.songId, pick.type, pick.levelIndex),
            );
            return record ? (
              <PhigrosScoreCard
                catalogTitle={pick.title}
                key={key}
                record={record}
                totalNotes={noteTotalByKey[
                  phigrosChartNoteKey(record.songId, record.levelIndex)
                ]}
              />
            ) : (
              <RandomUnplayedChartCard
                badge={(
                  <PhigrosDifficultyBadge
                    constant={pick.difficultyConstant}
                    levelIndex={pick.levelIndex}
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
