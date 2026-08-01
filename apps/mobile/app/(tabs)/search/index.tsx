import { memo, useCallback, useDeferredValue, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { CatalogListPage } from '@/components/game-content/GameListPages';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { ChartTypeBadge, DifficultyBadge } from '@/components/ScoreVisuals';
import { SongCover } from '@/components/SongCover';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import { ChunithmSongRow } from '@/components/chunithm/ChunithmSongRow';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import type { ChunithmSong } from '@/domain/chunithm';
import { matchesChunithmChartFilter } from '@/domain/chunithm-filters';
import { buildDxRatingChartTagIndex, dxRatingChartHasAllTags } from '@/domain/dxrating-chart-tags';
import { parseConstantBound } from '@/domain/maimai-filters';
import { phigrosLevelToDifficulty } from '@/domain/phigros-filters';
import type { Chart, ChartType, Song } from '@/domain/models';
import { localizedVersionName } from '@/domain/version-names';
import { presentStandardSong } from '@/features/game-content/adapters';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDxRatingChartTags } from '@/hooks/use-dxrating-chart-tags';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useCatalogFilter } from '@/state/catalog-filter';
import { useChunithmCatalogFilter } from '@/state/chunithm-catalog-filter';
import { usePhigrosCatalogFilter } from '@/state/phigros-catalog-filter';
import {
  buildSearchDocument,
  buildSongSearchIndex,
  EMPTY_SONG_FILTERS,
  searchDocumentMatches,
  searchSongs,
} from '@/utils/search';
import { useAppTheme } from '@/theme/app-theme';

const TYPES: ChartType[] = ['SD', 'DX', 'UTAGE'];
export default function SearchTabScreen() {
  return <CachedTabScreen><SearchScreen /></CachedTabScreen>;
}

export function SearchScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
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
    if (activeGameId !== 'maimai' || selectedDxRatingTagIds.length === 0) return;
    if (dxRatingChartTags.data) {
      const validIds = new Set(dxRatingChartTags.data.tags.map((tag) => tag.id));
      const next = selectedDxRatingTagIds.filter((tagId) => validIds.has(tagId));
      if (next.length !== selectedDxRatingTagIds.length) setSelectedDxRatingTagIds(next);
    } else if (dxRatingChartTags.isError) {
      setSelectedDxRatingTagIds([]);
    }
  }, [activeGameId, dxRatingChartTags.data, dxRatingChartTags.isError, selectedDxRatingTagIds, setSelectedDxRatingTagIds]);
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
    />
  ), [
    favoriteSongIds,
    library.isLoading,
    library.isUpdating,
    selectedChartVersionId,
    selectedVersionLabel,
    toggleFavorite,
    versionLabelsById,
  ]);

  if (activeGameId === 'phigros') {
    return <PhigrosSearchScreen />;
  }

  if (activeGameId === 'chunithm') {
    return <ChunithmSearchScreen />;
  }

  if (activeGameId !== 'maimai') {
    return <EmptyDataView title="暂无曲库" detail="当前游戏暂未接入曲库数据" />;
  }

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput accessibilityLabel="歌曲搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / ID / 别名 / 曲师 / 谱师 / 罗马音" placeholderTextColor={theme.textMuted}
          value={keyword} onChangeText={setKeyword}
          style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
        <Text style={styles.resultCount}>{isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`}</Text>
      </View>
      <MaimaiFilterBar collapsed={collapsed} onCollapsedChange={setCollapsed}
        difficulty={difficulty} version={version} type={type}
        constantMin={constantMin} constantMax={constantMax} versionLocale={versionLocale} versions={versions}
        dxRatingTags={dxRatingChartTags.data?.tags ?? []}
        selectedDxRatingTagIds={selectedDxRatingTagIds}
        dxRatingTagState={dxRatingChartTags.data ? 'ready' : dxRatingChartTags.isLoading ? 'loading' : 'unavailable'}
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
          ...TAB_LIST_CACHE_PROPS,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 20 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          ListHeaderComponent: query.data ? <SourceStatus items={[{
            key: 'catalog',
            label: query.data.source.label,
            updatedAt: query.data.source.updatedAt,
            state: query.data.source.isStale ? 'cache' : 'live',
          }, ...(dxRatingChartTags.data ? [{
            key: 'dxrating-tags' as const,
            label: dxRatingChartTags.data.source.label,
            updatedAt: dxRatingChartTags.data.source.updatedAt,
            state: dxRatingChartTags.data.source.isStale ? 'cache' as const : 'live' as const,
          }] : dxRatingChartTags.isError ? [{
            key: 'dxrating-tags' as const, label: 'DXRating 标签不可用', state: 'unavailable' as const,
          }] : [])]} /> : null,
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
}: {
  song: Song;
  favorite: boolean;
  favoritePending: boolean;
  onFavoriteChange: (songId: string, favorite: boolean) => void;
  selectedChartVersionId?: number;
  selectedVersionLabel?: string;
  versionLabelsById: ReadonlyMap<number, string>;
}) {
  const theme = useAppTheme();
  const presentation = presentStandardSong('maimai', song);
  const displayedCharts = selectedChartVersionId === undefined
    ? song.charts
    : song.charts.filter((chart) => chart.versionId === selectedChartVersionId);
  const displayedVersion = selectedVersionLabel ?? songChartVersionLabel(song, versionLabelsById);
  return <GameSongRow
    presentation={presentation}
    accessibilityLabel={null}
    rowStyle={styles.row}
    openStyle={styles.openSong}
    mainStyle={styles.main}
    titleStyle={styles.title}
    subtitleStyle={styles.meta}
    subtitleContent={<>{song.artist ?? '曲师未知'} · {displayedVersion}</>}
    cover={<SongCover songId={song.id} />}
    badges={<SongChartBadges songId={song.id} charts={displayedCharts} />}
    accessory={<Pressable accessibilityRole="button" accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
      disabled={favoritePending} onPress={() => onFavoriteChange(song.id, !favorite)} style={styles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
    </Pressable>}
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

function ChunithmSearchScreen() {
  const query = useChunithmCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const {
    keyword, collapsed, difficulty, version, constantMin, constantMax,
    setKeyword, setCollapsed, setDifficulty, setVersion, setConstantMin, setConstantMax, clearFilters,
  } = useChunithmCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const searchDocuments = useMemo(() => new Map(
    (query.data?.songs ?? []).map((song) => [
      song.id,
      buildSearchDocument([
        String(song.id),
        song.title,
        ...(song.artist ? [song.artist] : []),
        ...song.difficulties.flatMap(
          (difficulty) => difficulty.noteDesigner ? [difficulty.noteDesigner] : [],
        ),
      ]),
    ] as const),
  ), [query.data?.songs]);
  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword,
    difficulty,
    version,
    constantMin,
    constantMax,
  }), [constantMax, constantMin, debouncedKeyword, difficulty, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo(() => {
    const songs = query.data?.songs ?? [];
    return songs.flatMap((song) => {
      if (deferredFilterSpec.keyword.trim()) {
        const document = searchDocuments.get(song.id);
        if (!document || !searchDocumentMatches(document, deferredFilterSpec.keyword)) return [];
      }
      const difficulties = song.difficulties.filter((chart) => matchesChunithmChartFilter(
        chart,
        deferredFilterSpec,
      ));
      return difficulties.length ? [{ song, difficulties }] : [];
    });
  }, [deferredFilterSpec, query.data?.songs, searchDocuments]);
  const isFiltering = filterSpec !== deferredFilterSpec;
  const selectedVersionTitle = deferredFilterSpec.version === 'all'
    ? undefined
    : query.data?.versions.find((item) => String(item.id) === deferredFilterSpec.version)?.title;
  const hasActiveFilters = !!(
    keyword.trim()
    || difficulty !== 'all'
    || version !== 'all'
    || constantMin
    || constantMax
  );
  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput
          accessibilityLabel="中二节奏歌曲搜索"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="曲名 / ID / 曲师 / 谱师"
          placeholderTextColor={theme.textMuted}
          value={keyword}
          onChangeText={setKeyword}
          style={[
            styles.searchBox,
            { backgroundColor: theme.input, borderColor: theme.border, color: theme.text },
          ]}
        />
        <Text style={[styles.resultCount, { color: theme.textMuted }]}>
          {isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`}
        </Text>
      </View>
      <ChunithmFilterBar
        collapsed={collapsed}
        constantMax={constantMax}
        constantMin={constantMin}
        difficulty={difficulty}
        onCollapsedChange={setCollapsed}
        onConstantMaxChange={setConstantMax}
        onConstantMinChange={setConstantMin}
        onDifficultyChange={setDifficulty}
        onReset={clearFilters}
        onVersionChange={setVersion}
        version={version}
        versions={query.data?.versions ?? []}
      />
      <CatalogListPage<{ song: ChunithmSong; difficulties: ChunithmSong['difficulties'] }>
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyText={hasActiveFilters ? '筛选结果为空' : '暂无曲库数据'}
        data={query.data && filtered.length > 0 ? filtered : undefined}
        flatListProps={{
          testID: 'chunithm-catalog-results-list',
          contentInsetAdjustmentBehavior: 'automatic',
          keyExtractor: (item) => String(item.song.id),
          ...TAB_LIST_CACHE_PROPS,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 20 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          ListHeaderComponent: query.data ? <SourceStatus items={[{
            key: 'catalog',
            label: query.data.source.label,
            updatedAt: query.data.source.updatedAt,
            state: query.data.source.isStale ? 'cache' : 'live',
          }]} /> : null,
          renderItem: ({ item }) => (
            <ChunithmSongRow
              displayedDifficulties={item.difficulties}
              displayedVersionTitle={selectedVersionTitle}
              song={item.song}
            />
          ),
        }}
      />
    </View>
  );
}

function PhigrosSearchScreen() {
  const query = usePhigrosCatalog();
  const library = useUserLibrary();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const {
    keyword, collapsed, level, constantMin, constantMax,
    setKeyword, setCollapsed, setLevel, setConstantMin, setConstantMax, clearFilters,
  } = usePhigrosCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const index = useMemo(() => buildSongSearchIndex(query.data?.snapshot.songs ?? []), [query.data?.snapshot.songs]);
  const filterSpec = useMemo(() => ({
    ...EMPTY_SONG_FILTERS,
    keyword: debouncedKeyword,
    difficulties: level === 'all' ? [] : [phigrosLevelToDifficulty(level)],
    constantMin: parseConstantBound(constantMin),
    constantMax: parseConstantBound(constantMax),
  }), [constantMax, constantMin, debouncedKeyword, level]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo(() => searchSongs(index, deferredFilterSpec), [deferredFilterSpec, index]);
  const isFiltering = filterSpec !== deferredFilterSpec;
  const favoriteSongIds = useMemo(
    () => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.songId)),
    [library.data],
  );
  const hasActiveFilters = !!(keyword.trim() || level !== 'all' || constantMin || constantMax);

  const provider = query.data?.provider ?? null;
  const blurUrls = useMemo(() => {
    const map = new Map<string, string>();
    if (!provider) return map;
    for (const song of filtered) {
      const url = provider.getIllustrationBlurUrl(song.id);
      if (url) map.set(song.id, url);
    }
    return map;
  }, [filtered, provider]);

  const source = useMemo(() => query.data?.snapshot.source, [query.data?.snapshot.source]);
  const setSongFavorite = library.setSongFavorite;
  const toggleFavorite = useCallback((songId: string, favorite: boolean) => {
    void setSongFavorite(songId, favorite);
  }, [setSongFavorite]);
  const renderPhigrosItem = useCallback<ListRenderItem<Song>>(({ item }) => (
    <PhigrosSongRow
      song={item}
      blurUrl={blurUrls.get(item.id) ?? null}
      favorite={favoriteSongIds.has(item.id)}
      favoritePending={library.isLoading || library.isUpdating}
      onFavoriteChange={toggleFavorite}
    />
  ), [
    blurUrls,
    favoriteSongIds,
    library.isLoading,
    library.isUpdating,
    toggleFavorite,
  ]);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput accessibilityLabel="歌曲搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / 曲师 / 谱师" placeholderTextColor={theme.textMuted}
          value={keyword} onChangeText={setKeyword}
          style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
        <Text style={styles.resultCount}>{isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`}</Text>
      </View>
      <PhigrosFilterBar
        collapsed={collapsed} onCollapsedChange={setCollapsed}
        level={level} constantMin={constantMin} constantMax={constantMax}
        onLevelChange={setLevel} onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onReset={clearFilters}
      />
      <CatalogListPage<Song>
        isLoading={query.isLoading} isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0}
        error={query.error} onRetry={() => void query.refetch()}
        emptyText={hasActiveFilters ? '筛选结果为空' : '暂无曲库数据'}
        data={query.data && filtered.length > 0 ? filtered : undefined}
        flatListProps={{
          testID: 'phigros-catalog-results-list',
          keyExtractor: songKey,
          ...TAB_LIST_CACHE_PROPS,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 20 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          ListHeaderComponent: source ? <SourceStatus items={[{
            key: 'catalog',
            label: source.label,
            updatedAt: source.updatedAt,
            state: source.isStale ? 'cache' : 'live',
          }]} /> : null,
          renderItem: renderPhigrosItem,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  searchArea: { padding: 12, paddingBottom: 8, gap: 6, backgroundColor: '#FFF' },
  searchBox: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 11, backgroundColor: '#FFF', color: '#111827' },
  resultCount: { color: '#6B7280', fontSize: 11 },
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20, gap: 9 },
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openSong: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '700' },
  meta: { color: '#6B7280', fontSize: 11 },
  chartGroups: { gap: 4 },
  chartGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
});
