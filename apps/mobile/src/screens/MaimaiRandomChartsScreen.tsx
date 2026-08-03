import { useEffect, useMemo, useState } from 'react';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { RandomChartsPage } from '@/components/RandomChartsPage';
import { ScoreRecordCard, type ScoreRecordCardData } from '@/components/ScoreRecordCard';
import { chartVersionKey, normalizeSongId } from '@/domain/catalog';
import type { CatalogSnapshot, ScoreRecord } from '@/domain/models';
import {
  buildBestRecordMap,
  filterMaimaiRandomCharts,
  pickRandomItems,
  type RandomChartPick,
} from '@/domain/random-charts';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRandomChartsFilter } from '@/state/random-charts-filter';

function toScoreCardData(
  pick: RandomChartPick,
  bestByChart: ReadonlyMap<string, ScoreRecord>,
): ScoreRecordCardData {
  const key = chartVersionKey(pick.songId, pick.type, pick.levelIndex);
  const record = bestByChart.get(key);
  if (record) {
    return {
      songId: normalizeSongId(record.songId),
      title: record.title,
      type: record.type,
      difficulty: record.difficulty,
      difficultyConstant: record.difficultyConstant,
      levelIndex: record.levelIndex,
      achievements: record.achievements,
      dxScore: record.dxScore,
      rating: record.rating,
      fc: record.fc,
      fs: record.fs,
      rate: record.rate,
    };
  }
  return {
    songId: pick.songId,
    title: pick.title,
    type: pick.type,
    difficulty: pick.difficulty,
    difficultyConstant: pick.difficultyConstant,
    levelIndex: pick.levelIndex,
  };
}

export function MaimaiRandomChartsScreen() {
  const catalog = useDetailedCatalog();
  const scores = useScoreSnapshot();
  const dxRatingChartTags = useDxRatingChartTags();
  const {
    count, collapsed, difficulty, version, type, constantMin, constantMax,
    achievementMin, achievementMax, soloAchievement, multiAchievement,
    selectedDxRatingTagIds, versionLocale,
    hydrate, setCount, setCollapsed, setDifficulty, setVersion, setType,
    setConstantMin, setConstantMax, setAchievementMin, setAchievementMax,
    setSoloAchievement, setMultiAchievement, setSelectedDxRatingTagIds,
    setVersionLocale, clearFilters,
  } = useRandomChartsFilter();
  const [results, setResults] = useState<RandomChartPick[] | null>(null);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (selectedDxRatingTagIds.length === 0) return;
    if (dxRatingChartTags.data) {
      const validIds = new Set(dxRatingChartTags.data.tags.map((tag) => tag.id));
      const next = selectedDxRatingTagIds.filter((tagId) => validIds.has(tagId));
      if (next.length !== selectedDxRatingTagIds.length) setSelectedDxRatingTagIds(next);
    } else if (dxRatingChartTags.isError) {
      setSelectedDxRatingTagIds([]);
    }
  }, [dxRatingChartTags.data, dxRatingChartTags.isError, selectedDxRatingTagIds, setSelectedDxRatingTagIds]);

  const records = useMemo(() => scores.data?.records ?? [], [scores.data?.records]);
  const bestByChart = useMemo(() => buildBestRecordMap(records), [records]);
  const versions = useMemo<VersionFilterOption[]>(() => (
    catalog.data?.versions ?? []
  ).map((item) => ({
    value: item.title,
    name: item.title,
    versionId: item.id,
  })), [catalog.data?.versions]);
  const filters = useMemo(() => ({
    difficulty,
    version,
    type,
    constantMin,
    constantMax,
    achievementMin,
    achievementMax,
    soloAchievement,
    multiAchievement,
    selectedDxRatingTagIds,
  }), [
    achievementMax,
    achievementMin,
    constantMax,
    constantMin,
    difficulty,
    multiAchievement,
    selectedDxRatingTagIds,
    soloAchievement,
    type,
    version,
  ]);
  const pool = useMemo(
    () => catalog.data
      ? filterMaimaiRandomCharts(catalog.data, records, filters, dxRatingChartTags.data)
      : [],
    [catalog.data, dxRatingChartTags.data, filters, records],
  );

  const draw = () => {
    const seed = `${Date.now()}-${Math.random()}`;
    setLastSeed(seed);
    setResults(pickRandomItems(pool, count, seed));
  };

  return (
    <QueryStateView<CatalogSnapshot>
      data={catalog.data}
      error={catalog.error}
      isEmpty={false}
      isError={catalog.isError}
      isLoading={catalog.isLoading}
      onRetry={() => {
        void catalog.refetch();
        void scores.refetch();
      }}
      renderData={(data) => (
        <RandomChartsPage
          count={count}
          emptyMessage="没有符合条件的谱面，请放宽筛选后再试。"
          filter={(
            <MaimaiFilterBar
              achievementMax={achievementMax}
              achievementMin={achievementMin}
              collapsed={collapsed}
              constantMax={constantMax}
              constantMin={constantMin}
              difficulty={difficulty}
              dxRatingTagState={dxRatingChartTags.data ? 'ready' : dxRatingChartTags.isLoading ? 'loading' : 'unavailable'}
              dxRatingTags={dxRatingChartTags.data?.tags ?? []}
              multiAchievement={multiAchievement}
              onAchievementMaxChange={setAchievementMax}
              onAchievementMinChange={setAchievementMin}
              onCollapsedChange={setCollapsed}
              onConstantMaxChange={setConstantMax}
              onConstantMinChange={setConstantMin}
              onDifficultyChange={setDifficulty}
              onDxRatingTagIdsChange={setSelectedDxRatingTagIds}
              onMultiAchievementChange={setMultiAchievement}
              onReset={clearFilters}
              onSoloAchievementChange={setSoloAchievement}
              onTypeChange={setType}
              onVersionChange={setVersion}
              onVersionLocaleChange={setVersionLocale}
              selectedDxRatingTagIds={selectedDxRatingTagIds}
              soloAchievement={soloAchievement}
              type={type}
              version={version}
              versionLocale={versionLocale}
              versions={versions}
            />
          )}
          hasDrawn={results !== null}
          onCountChange={setCount}
          onDraw={draw}
          poolSize={pool.length}
          resultCount={results?.length ?? 0}
          results={results?.map((pick) => (
            <ScoreRecordCard
              key={`${lastSeed}-${chartVersionKey(pick.songId, pick.type, pick.levelIndex)}`}
              record={toScoreCardData(pick, bestByChart)}
            />
          ))}
          sourceItems={[
            {
              key: 'catalog',
              label: data.source.label,
              updatedAt: data.source.updatedAt,
              state: data.source.isStale ? 'cache' : 'live',
            },
            {
              key: 'scores',
              label: scores.data?.source?.label ?? '成绩不可用',
              updatedAt: scores.data?.source?.updatedAt,
              state: !scores.data
                ? 'unavailable'
                : scores.data.source?.isStale ? 'cache' : 'live',
            },
          ]}
        />
      )}
    />
  );
}
