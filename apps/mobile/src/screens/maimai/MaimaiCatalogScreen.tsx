import { memo, useCallback, useDeferredValue, useEffect, useMemo } from 'react';
import { View, type ListRenderItem } from 'react-native';
import { CatalogListPage } from '@/components/game-content/GameListPages';
import { FavoriteSongRow } from '@/components/game-content/FavoriteSongRow';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { SIMAI_CATALOG_LIST_STYLES as styles } from '@/components/game-content/SimaiListStyles';
import { MaimaiFilterBar, dxRatingTagFilterState, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { ChartTypeBadge, DifficultyBadge } from '@/components/ScoreVisuals';
import { SongCover } from '@/components/SongCover';
import { buildDxRatingChartTagIndex, dxRatingChartHasAllTags } from '@/domain/dxrating-chart-tags';
import { parseConstantBound } from '@/domain/maimai-filters';
import type { Chart, ChartType, Song } from '@/domain/models';
import { localizedVersionName } from '@/domain/version-names';
import { presentStandardSong } from '@/features/game-content/adapters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useCatalogFilter } from '@/state/catalog-filter';
import { useAppTheme } from '@/theme/app-theme';
import {
  EMPTY_SONG_FILTERS,
  buildSongSearchIndex,
  findMatchedAlias,
  searchSongs,
} from '@/utils/search';

const TYPES: ChartType[] = ['SD', 'DX', 'UTAGE'];

/** 舞萌曲库列表：查询、筛选 Store、搜索索引与派生计算都只在这个页面内挂载。 */
export function MaimaiCatalogScreen() {
  const query = useDetailedCatalog();
  const dxRatingChartTags = useDxRatingChartTags();
  const tabBottomInset = useNativeTabBottomInset();
  const library = useUserLibrary();
  const theme = useAppTheme();
  const {
    keyword, collapsed, type, difficulty, constantMin, constantMax, version, versionLocale, selectedDxRatingTagIds,
    setKeyword, setCollapsed, setType, setDifficulty, setConstantMin, setConstantMax, setVersion, setVersionLocale,
    setSelectedDxRatingTagIds, clearFilters,
  } = useCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const index = useMemo(() => buildSongSearchIndex(query.data?.songs ?? []), [query.data?.songs]);
  const dxRatingTagIndex = useMemo(() => buildDxRatingChartTagIndex(
    dxRatingChartTags.data,
    query.data?.songs ?? [],
  ), [dxRatingChartTags.data, query.data?.songs]);

  useEffect(() => {
    if (selectedDxRatingTagIds.length === 0) return;
    if (!dxRatingChartTags.data) return;
    const validIds = new Set(dxRatingChartTags.data.tags.map((tag) => tag.id));
    const next = selectedDxRatingTagIds.filter((tagId) => validIds.has(tagId));
    if (next.length !== selectedDxRatingTagIds.length) setSelectedDxRatingTagIds(next);
  }, [dxRatingChartTags.data, selectedDxRatingTagIds, setSelectedDxRatingTagIds]);

  const versions = useMemo<VersionFilterOption[]>(() => (query.data?.versions ?? []).map((item) => ({
    value: String(item.id), name: item.title, versionId: item.id,
  })), [query.data?.versions]);
  const filterSpec = useMemo(() => ({
    ...EMPTY_SONG_FILTERS,
    keyword: debouncedKeyword,
    types: type === 'all' ? [] : [type],
    difficulties: difficulty === 'all' ? [] : [difficulty],
    constantMin: parseConstantBound(constantMin),
    constantMax: parseConstantBound(constantMax),
    chartVersionIds: version === 'all' ? [] : [Number(version)],
    selectedDxRatingTagIds,
  }), [constantMax, constantMin, debouncedKeyword, difficulty, selectedDxRatingTagIds, type, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo(() => searchSongs(
    index,
    deferredFilterSpec,
    dxRatingChartTags.data && deferredFilterSpec.selectedDxRatingTagIds.length > 0
      ? (song, chart) => dxRatingChartHasAllTags(
          dxRatingTagIndex,
          song.id,
          chart.type,
          chart.levelIndex,
          deferredFilterSpec.selectedDxRatingTagIds,
        )
      : undefined,
  ), [deferredFilterSpec, dxRatingChartTags.data, dxRatingTagIndex, index]);
  const isFiltering = filterSpec !== deferredFilterSpec;
  const versionLabelsById = useMemo(() => new Map(versions.flatMap((option) =>
    option.versionId === undefined
      ? []
      : [[option.versionId, localizedVersionName(option.versionId, option.name, versionLocale)] as const],
  )), [versionLocale, versions]);
  const selectedChartVersionId = deferredFilterSpec.chartVersionIds[0];
  const selectedVersionLabel = selectedChartVersionId === undefined
    ? undefined
    : versionLabelsById.get(selectedChartVersionId) ?? String(selectedChartVersionId);
  const favoriteSongIds = useMemo(
    () => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.songId)),
    [library.data],
  );
  const matchedAliasById = useMemo(() => {
    if (!debouncedKeyword.trim()) return null;
    const map = new Map<string, string>();
    for (const song of filtered) {
      const alias = findMatchedAlias(song, debouncedKeyword);
      if (alias) map.set(song.id, alias);
    }
    return map;
  }, [debouncedKeyword, filtered]);
  const setSongFavorite = library.setSongFavorite;
  const toggleFavorite = useCallback((songId: string, favorite: boolean) => {
    void setSongFavorite(songId, favorite);
  }, [setSongFavorite]);
  const renderCatalogItem = useCallback<ListRenderItem<Song>>(({ item }) => (
    <CatalogSongRow
      song={item}
      favorite={favoriteSongIds.has(item.id)}
      favoritePending={library.isLoading || library.isUpdating}
      onFavoriteChange={toggleFavorite}
      selectedChartVersionId={selectedChartVersionId}
      selectedVersionLabel={selectedVersionLabel}
      versionLabelsById={versionLabelsById}
      matchedAlias={matchedAliasById?.get(item.id)}
    />
  ), [
    favoriteSongIds,
    library.isLoading,
    library.isUpdating,
    matchedAliasById,
    selectedChartVersionId,
    selectedVersionLabel,
    toggleFavorite,
    versionLabelsById,
  ]);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <GameSearchHeader layout="catalog" accessibilityLabel="歌曲搜索"
        placeholder="曲名 / ID / 别名 / 曲师 / 谱师 / 罗马音" value={keyword} onChangeText={setKeyword}
        resultCountText={isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`} />
      <MaimaiFilterBar collapsed={collapsed} onCollapsedChange={setCollapsed}
        difficulty={difficulty} version={version} type={type}
        constantMin={constantMin} constantMax={constantMax} versionLocale={versionLocale} versions={versions}
        dxRatingTags={dxRatingChartTags.data?.tags ?? []}
        selectedDxRatingTagIds={selectedDxRatingTagIds}
        dxRatingTagState={dxRatingTagFilterState(dxRatingChartTags)}
        onDifficultyChange={setDifficulty} onVersionChange={setVersion} onTypeChange={setType}
        onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onVersionLocaleChange={setVersionLocale} onDxRatingTagIdsChange={setSelectedDxRatingTagIds}
        onReset={clearFilters} />
      <CatalogListPage<Song> isLoading={query.isLoading} isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0}
        error={query.error} onRetry={() => void query.refetch()} emptyText={keyword.trim() ? '筛选结果为空' : '暂无曲库数据'}
        data={query.data && filtered.length > 0 ? filtered : undefined}
        flatListProps={{
          testID: 'catalog-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          keyExtractor: songKey,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 20 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          renderItem: renderCatalogItem,
        }}
      />
    </View>
  );
}

const CatalogSongRow = memo(function CatalogSongRow({
  song,
  favorite,
  favoritePending,
  onFavoriteChange,
  selectedChartVersionId,
  selectedVersionLabel,
  versionLabelsById,
  matchedAlias,
}: {
  song: Song;
  favorite: boolean;
  favoritePending: boolean;
  onFavoriteChange: (songId: string, favorite: boolean) => void;
  selectedChartVersionId?: number;
  selectedVersionLabel?: string;
  versionLabelsById: ReadonlyMap<number, string>;
  matchedAlias?: string;
}) {
  const presentation = presentStandardSong('maimai', song);
  const displayedCharts = selectedChartVersionId === undefined
    ? song.charts
    : song.charts.filter((chart) => chart.versionId === selectedChartVersionId);
  const displayedVersion = selectedVersionLabel ?? songChartVersionLabel(song, versionLabelsById);
  return <FavoriteSongRow
    presentation={presentation}
    matchedAlias={matchedAlias}
    subtitleContent={<>{song.artist ?? '曲师未知'} · {displayedVersion}</>}
    cover={<SongCover songId={song.id} />}
    badges={<SongChartBadges songId={song.id} charts={displayedCharts} />}
    favorite={favorite} favoritePending={favoritePending} onFavoriteChange={onFavoriteChange}
  />;
});

function songChartVersionLabel(song: Song, versionLabelsById: ReadonlyMap<number, string>): string {
  const versionIds = new Set(song.charts.flatMap((chart) =>
    chart.versionId === undefined ? [] : [chart.versionId]));
  if (versionIds.size === 0) return song.version;
  if (versionIds.size === 1) {
    const [versionId] = versionIds;
    return versionLabelsById.get(versionId) ?? String(versionId);
  }
  return TYPES.flatMap((chartType) => {
    const typeVersionIds = [...new Set(song.charts.flatMap((chart) =>
      chart.type === chartType && chart.versionId !== undefined ? [chart.versionId] : []))];
    if (typeVersionIds.length === 0) return [];
    const labels = typeVersionIds.map((versionId) =>
      versionLabelsById.get(versionId) ?? String(versionId));
    return [`${chartType} ${labels.join(' / ')}`];
  }).join(' · ');
}

const SongChartBadges = memo(function SongChartBadges({ songId, charts }: { songId: string; charts: Chart[] }) {
  return <View testID={`song-chart-badges-${songId}`} accessibilityLabel="谱面定数" style={styles.chartGroups}>
    {TYPES.map((chartType) => {
      const typeCharts = charts.filter((chart) => chart.type === chartType)
        .sort((left, right) => left.levelIndex - right.levelIndex);
      if (!typeCharts.length) return null;
      return <View key={chartType} style={styles.chartGroup}>
        {chartType === 'UTAGE' ? null : <ChartTypeBadge type={chartType} />}
        {typeCharts.map((chart) => <DifficultyBadge key={`${chart.type}-${chart.levelIndex}`}
          difficulty={chart.difficulty} constant={chart.difficultyConstant} display="constant" compact
          specialLabel={chart.type === 'UTAGE'
            ? `${chart.utage?.kanji?.trim() || 'U·TA·GE'} ${chart.level}`.trim()
            : undefined} />)}
      </View>;
    })}
  </View>;
});

function songKey(song: Song): string { return song.id; }
