import { useCallback, useEffect, useMemo } from 'react';
import { type ListRenderItem } from 'react-native';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { RecordsListPage } from '@/components/game-content/GameListPages';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { MaimaiFilterBar, dxRatingTagFilterState, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { buildDxRatingChartTagIndex, dxRatingChartHasAllTags } from '@/domain/dxrating-chart-tags';
import {
  maimaiGenres,
  matchesMaimaiGenre,
  matchesAchievementRange,
  matchesConstantRange,
  matchesMultiAchievementFilter,
  matchesSoloAchievementFilter,
} from '@/domain/maimai-filters';
import type { ScoreRecord } from '@/domain/models';
import { useLocalSearch } from '@/hooks/use-local-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';
import { searchDocumentFor, songSearchDocument, searchDocumentMatches } from '@/utils/search';

const recordSearchValues = (record: ScoreRecord) => [record.songId, record.title];

export function MaimaiRecordsScreen() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const catalog = useDetailedCatalog();
  const dxRatingChartTags = useDxRatingChartTags();
  const {
    keyword, collapsed, difficulty, version, genre, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, versionLocale, selectedDxRatingTagIds,
    setKeyword, setCollapsed,
    setDifficulty, setVersion, setGenre, setType, setConstantMin, setConstantMax, setAchievementMin, setAchievementMax,
    setSoloAchievement, setMultiAchievement, setVersionLocale, setSelectedDxRatingTagIds, clearFilters,
  } = useRecordsFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const searchBySongId = useMemo(() => new Map(catalog.data?.songs.map((song) => [song.id, song])), [catalog.data?.songs]);
  const genres = useMemo(() => maimaiGenres(catalog.data?.songs ?? []), [catalog.data?.songs]);
  const dxRatingTagIndex = useMemo(() => buildDxRatingChartTagIndex(
    dxRatingChartTags.data,
    catalog.data?.songs ?? [],
  ), [catalog.data?.songs, dxRatingChartTags.data]);
  const maimaiConstantValues = useMemo(() => catalog.data?.songs.flatMap((song) =>
    song.charts.filter((chart) => chart.type !== 'UTAGE').map((chart) => chart.difficultyConstant)) ?? [],
  [catalog.data?.songs]);
  const maimaiConstantBounds = useStableRangeBounds(
    maimaiConstantValues,
    { minimum: 1, maximum: 15.5 },
    constantMin ?? '',
    constantMax ?? '',
    `${activeAccountId}:${catalog.data?.source.updatedAt ?? 'loading'}`,
  );

  useEffect(() => {
    if (selectedDxRatingTagIds.length === 0) return;
    if (!dxRatingChartTags.data) return;
    const validIds = new Set(dxRatingChartTags.data.tags.map((tag) => tag.id));
    const next = selectedDxRatingTagIds.filter((tagId) => validIds.has(tagId));
    if (next.length !== selectedDxRatingTagIds.length) setSelectedDxRatingTagIds(next);
  }, [dxRatingChartTags.data, selectedDxRatingTagIds, setSelectedDxRatingTagIds]);

  const versions = useMemo<VersionFilterOption[]>(() => {
    if (!data) return [];
    return Array.from(new Set(data.records.map((record) => record.version))).sort()
      .map((name) => ({ value: name, name }));
  }, [data]);

  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword, difficulty, version, genre, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, selectedDxRatingTagIds,
  }), [achievementMax, achievementMin, soloAchievement, multiAchievement, constantMax, constantMin, debouncedKeyword, difficulty, genre, selectedDxRatingTagIds, type, version]);
  const sortedRecords = useMemo(() => data?.records.slice().sort((a, b) =>
    Number(a.type === 'UTAGE') - Number(b.type === 'UTAGE') || b.rating - a.rating || b.achievements - a.achievements), [data?.records]);
  const selectRecord = useCallback((record: ScoreRecord, filters: typeof filterSpec) => {
    if (!matchesMaimaiGenre(searchBySongId.get(record.songId)?.genre, filters.genre)) return undefined;
    if (filters.keyword.trim()) {
      const song = searchBySongId.get(record.songId);
      if (!searchDocumentMatches(song ? songSearchDocument(song) : searchDocumentFor(record, recordSearchValues), filters.keyword)) return undefined;
    }
    if (filters.difficulty !== 'all' && record.difficulty !== filters.difficulty) return undefined;
    if (filters.version !== 'all' && record.version !== filters.version) return undefined;
    if (filters.type !== 'all' && record.type !== filters.type) return undefined;
    if (record.type === 'UTAGE' && (filters.constantMin || filters.constantMax)) return undefined;
    if (!matchesConstantRange(record.difficultyConstant, filters.constantMin, filters.constantMax)
      || !matchesAchievementRange(record.achievements, filters.achievementMin, filters.achievementMax)
      || !matchesSoloAchievementFilter(record, filters.soloAchievement)
      || !matchesMultiAchievementFilter(record, filters.multiAchievement)) return undefined;
    if (dxRatingChartTags.data && filters.selectedDxRatingTagIds.length > 0
      && !dxRatingChartHasAllTags(dxRatingTagIndex, record.songId, record.type, record.levelIndex, filters.selectedDxRatingTagIds)) return undefined;
    return record;
  }, [dxRatingChartTags.data, dxRatingTagIndex, searchBySongId]);
  const { data: filtered, isFiltering } = useLocalSearch(sortedRecords, filterSpec, selectRecord, catalog.data?.songs);

  const isEmpty = !!data && filtered.length === 0;

  const controls = <>
    <GameSearchHeader accessibilityLabel="成绩搜索"
      placeholder="曲名 / 曲师 / 谱师 / 罗马音" value={keyword} onChangeText={setKeyword} />
    <MaimaiFilterBar collapsed={collapsed} onCollapsedChange={setCollapsed}
      difficulty={difficulty} version={version} type={type}
      genre={genre} genres={genres} onGenreChange={setGenre}
      constantMin={constantMin} constantMax={constantMax}
      constantBounds={maimaiConstantBounds}
      achievementMin={achievementMin} achievementMax={achievementMax}
      soloAchievement={soloAchievement} multiAchievement={multiAchievement}
      versionLocale={versionLocale} versions={versions}
      dxRatingTags={dxRatingChartTags.data?.tags ?? []}
      selectedDxRatingTagIds={selectedDxRatingTagIds}
      dxRatingTagState={dxRatingTagFilterState(dxRatingChartTags)}
      onDifficultyChange={setDifficulty} onVersionChange={setVersion} onTypeChange={setType}
      onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
      onAchievementMinChange={setAchievementMin} onAchievementMaxChange={setAchievementMax}
      onSoloAchievementChange={setSoloAchievement} onMultiAchievementChange={setMultiAchievement}
      onVersionLocaleChange={setVersionLocale} onDxRatingTagIdsChange={setSelectedDxRatingTagIds}
      onReset={clearFilters} />
  </>;
  return (
    <RecordsListPage<ScoreRecord>
      beforeList={controls}
      isLoading={isLoading || (isFiltering && filtered.length === 0)}
      isError={isError}
      isEmpty={isEmpty}
      error={error}
      onRetry={refetch ? () => void refetch() : undefined}
      emptyText="当前筛选条件下没有成绩"
      data={data && filtered.length > 0 ? filtered : undefined}
      count={data ? filtered.length : undefined} flatListProps={{
        testID: 'records-results-list',
        keyExtractor: recordKey,
        renderItem: renderRecord,
      }}
    />
  );
}

const renderRecord: ListRenderItem<ScoreRecord> = ({ item }) => <ScoreRecordCard record={item} />;

function recordKey(record: ScoreRecord): string {
  return `${record.songId}-${record.type}-${record.levelIndex}`;
}
