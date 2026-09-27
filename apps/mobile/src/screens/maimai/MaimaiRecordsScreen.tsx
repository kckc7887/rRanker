import { useDeferredValue, useEffect, useMemo } from 'react';
import { Text, View, type ListRenderItem } from 'react-native';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { RecordsListPage } from '@/components/game-content/GameListPages';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { SIMAI_RECORDS_LIST_STYLES as styles } from '@/components/game-content/SimaiListStyles';
import { MaimaiFilterBar, dxRatingTagFilterState, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { buildDxRatingChartTagIndex, dxRatingChartHasAllTags } from '@/domain/dxrating-chart-tags';
import {
  matchesAchievementRange,
  matchesConstantRange,
  matchesMultiAchievementFilter,
  matchesSoloAchievementFilter,
} from '@/domain/maimai-filters';
import type { ScoreRecord } from '@/domain/models';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useScoreSnapshot } from '@/hooks/use-score-snapshot';
import { useRecordsFilter } from '@/state/records-filter';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { buildSearchDocument, buildSongSearchIndex, searchDocumentMatches } from '@/utils/search';

/** 舞萌成绩列表：查询、筛选 Store、搜索索引与派生计算都只在这个页面内挂载。 */
export function MaimaiRecordsScreen() {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const { data, isLoading, isError, error, refetch } = useScoreSnapshot();
  const catalog = useDetailedCatalog();
  const dxRatingChartTags = useDxRatingChartTags();
  const theme = useAppTheme();
  const tabBottomInset = useNativeTabBottomInset();
  const {
    keyword, collapsed, difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, versionLocale, selectedDxRatingTagIds,
    setKeyword, setCollapsed,
    setDifficulty, setVersion, setType, setConstantMin, setConstantMax, setAchievementMin, setAchievementMax,
    setSoloAchievement, setMultiAchievement, setVersionLocale, setSelectedDxRatingTagIds, clearFilters,
  } = useRecordsFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const searchBySongId = useMemo(() => new Map(buildSongSearchIndex(catalog.data?.songs ?? [])
    .map(({ song, text, compact }) => [song.id, { text, compact }] as const)), [catalog.data?.songs]);
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
    keyword: debouncedKeyword, difficulty, version, type, constantMin, constantMax, achievementMin, achievementMax,
    soloAchievement, multiAchievement, selectedDxRatingTagIds,
  }), [achievementMax, achievementMin, soloAchievement, multiAchievement, constantMax, constantMin, debouncedKeyword, difficulty, selectedDxRatingTagIds, type, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo<ScoreRecord[]>(() => {
    if (!data) return [];
    let list = data.records.slice();
    if (deferredFilterSpec.keyword.trim()) list = list.filter((record) => searchDocumentMatches(
      searchBySongId.get(record.songId) ?? buildSearchDocument([record.songId, record.title]),
      deferredFilterSpec.keyword,
    ));
    if (deferredFilterSpec.difficulty !== 'all') {
      list = list.filter((record) => record.difficulty === deferredFilterSpec.difficulty);
    }
    if (deferredFilterSpec.version !== 'all') {
      list = list.filter((record) => record.version === deferredFilterSpec.version);
    }
    if (deferredFilterSpec.type !== 'all') {
      list = list.filter((record) => record.type === deferredFilterSpec.type);
    }
    const hasConstantFilter = !!(deferredFilterSpec.constantMin || deferredFilterSpec.constantMax);
    list = list.filter((record) => !(record.type === 'UTAGE' && hasConstantFilter) &&
      matchesConstantRange(
        record.difficultyConstant, deferredFilterSpec.constantMin, deferredFilterSpec.constantMax,
      ));
    list = list.filter((record) => matchesAchievementRange(
      record.achievements, deferredFilterSpec.achievementMin, deferredFilterSpec.achievementMax,
    ));
    list = list.filter((record) => matchesSoloAchievementFilter(record, deferredFilterSpec.soloAchievement));
    list = list.filter((record) => matchesMultiAchievementFilter(record, deferredFilterSpec.multiAchievement));
    if (dxRatingChartTags.data && deferredFilterSpec.selectedDxRatingTagIds.length > 0) {
      list = list.filter((record) => dxRatingChartHasAllTags(
        dxRatingTagIndex,
        record.songId,
        record.type,
        record.levelIndex,
        deferredFilterSpec.selectedDxRatingTagIds,
      ));
    }
    return list.sort((a, b) =>
      Number(a.type === 'UTAGE') - Number(b.type === 'UTAGE') ||
      b.rating - a.rating ||
      b.achievements - a.achievements);
  }, [data, deferredFilterSpec, dxRatingChartTags.data, dxRatingTagIndex, searchBySongId]);

  const isEmpty = !!data && filtered.length === 0;

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <GameSearchHeader layout="records" accessibilityLabel="成绩搜索"
        placeholder="曲名 / 曲师 / 谱师 / 罗马音" value={keyword} onChangeText={setKeyword} />
      <MaimaiFilterBar collapsed={collapsed} onCollapsedChange={setCollapsed}
        difficulty={difficulty} version={version} type={type}
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
      <RecordsListPage<ScoreRecord>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText="当前筛选条件下没有成绩"
        data={data && filtered.length > 0 ? filtered : undefined}
        flatListProps={{
          testID: 'records-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          style: styles.list,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 16 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          keyExtractor: recordKey,
          ...TAB_LIST_CACHE_PROPS,
          ListHeaderComponent: data ? <View style={styles.header}><Text style={styles.note}>共 {filtered.length} 条成绩</Text></View> : null,
          renderItem: renderRecord,
        }}
      />
    </View>
  );
}

const renderRecord: ListRenderItem<ScoreRecord> = ({ item }) => <ScoreRecordCard record={item} />;

function recordKey(record: ScoreRecord): string {
  return `${record.songId}-${record.type}-${record.levelIndex}`;
}
