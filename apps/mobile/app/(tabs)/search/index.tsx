import { memo, useCallback, useDeferredValue, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { ChartTypeBadge, DifficultyBadge } from '@/components/ScoreVisuals';
import { SongCover } from '@/components/SongCover';
import { SourceStatus } from '@/components/SourceStatus';
import { TAB_LIST_CACHE_PROPS } from '@/components/tab-list-cache';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import { parseConstantBound } from '@/domain/maimai-filters';
import { phigrosLevelToDifficulty } from '@/domain/phigros-filters';
import type { Chart, ChartType, DataSource, Song } from '@/domain/models';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useCatalogFilter } from '@/state/catalog-filter';
import { usePhigrosCatalogFilter } from '@/state/phigros-catalog-filter';
import { buildSongSearchIndex, EMPTY_SONG_FILTERS, searchSongs } from '@/utils/search';
import { useAppTheme } from '@/theme/app-theme';

const TYPES: ChartType[] = ['SD', 'DX'];
type LibraryHook = ReturnType<typeof useUserLibrary>;

/** 与成绩页共用：安卓需去掉字体内边距，并用略不对称的上下 padding 把文字光学居中。 */
const SEARCH_BOX_STYLE = {
  borderWidth: 1,
  borderRadius: 10,
  paddingHorizontal: 11,
  paddingTop: Platform.OS === 'android' ? 7 : 11,
  paddingBottom: Platform.OS === 'android' ? 13 : 11,
  ...(Platform.OS === 'android'
    ? { textAlignVertical: 'center' as const, includeFontPadding: false }
    : null),
};
export default function SearchTabScreen() {
  return <CachedTabScreen><SearchScreen /></CachedTabScreen>;
}

export function SearchScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const query = useDetailedCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const library = useUserLibrary();
  const theme = useAppTheme();
  const {
    keyword, collapsed, type, difficulty, constantMin, constantMax, version, versionLocale,
    setKeyword, setCollapsed, setType, setDifficulty, setConstantMin, setConstantMax, setVersion, setVersionLocale,
    clearFilters,
  } = useCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const index = useMemo(() => buildSongSearchIndex(query.data?.songs ?? []), [query.data?.songs]);
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
  }), [constantMax, constantMin, debouncedKeyword, difficulty, type, version]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo(() => searchSongs(index, deferredFilterSpec), [deferredFilterSpec, index]);
  const isFiltering = filterSpec !== deferredFilterSpec;
  const viewData = query.data && filtered.length > 0 ? { songs: filtered, source: query.data.source } : undefined;
  const favoriteSongIds = useMemo(
    () => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.songId)),
    [library.data],
  );

  if (activeGameId === 'phigros') {
    return <PhigrosSearchScreen />;
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
        onDifficultyChange={setDifficulty} onVersionChange={setVersion} onTypeChange={setType}
        onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onVersionLocaleChange={setVersionLocale} onReset={clearFilters} />
      <QueryStateView<{ songs: Song[]; source: DataSource }> isLoading={query.isLoading} isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0}
        error={query.error} onRetry={() => void query.refetch()} emptyText={keyword.trim() ? '筛选结果为空' : '暂无曲库数据'}
        data={viewData} renderData={(result) => (
          <CatalogResultsList songs={result.songs} source={result.source} tabBottomInset={tabBottomInset}
            favoriteSongIds={favoriteSongIds} favoritePending={library.isLoading || library.isUpdating}
            setSongFavorite={library.setSongFavorite} />
        )} />
    </View>
  );
}

const CatalogResultsList = memo(function CatalogResultsList({
  songs,
  source,
  tabBottomInset,
  favoriteSongIds,
  favoritePending,
  setSongFavorite,
}: {
  songs: Song[];
  source: DataSource;
  tabBottomInset: number;
  favoriteSongIds: ReadonlySet<string>;
  favoritePending: boolean;
  setSongFavorite: LibraryHook['setSongFavorite'];
}) {
  const toggleFavorite = useCallback((songId: string, favorite: boolean) => {
    void setSongFavorite(songId, favorite);
  }, [setSongFavorite]);
  const renderItem = useCallback<ListRenderItem<Song>>(({ item }) => {
    const favorite = favoriteSongIds.has(item.id);
    return <CatalogSongRow song={item} favorite={favorite} favoritePending={favoritePending}
      onFavoriteChange={toggleFavorite} />;
  }, [favoriteSongIds, favoritePending, toggleFavorite]);
  const sourceHeader = useMemo(() => <SourceStatus items={[{
    key: 'catalog', label: source.label, updatedAt: source.updatedAt,
    state: source.isStale ? 'cache' : 'live',
  }]} />, [source]);

  return <FlatList testID="catalog-results-list" contentInsetAdjustmentBehavior="automatic"
    data={songs} keyExtractor={songKey} {...TAB_LIST_CACHE_PROPS}
    contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 20 }]}
    scrollIndicatorInsets={{ bottom: tabBottomInset }} ListHeaderComponent={sourceHeader}
    renderItem={renderItem} />;
});

const CatalogSongRow = memo(function CatalogSongRow({ song, favorite, favoritePending, onFavoriteChange }: {
  song: Song;
  favorite: boolean;
  favoritePending: boolean;
  onFavoriteChange: (songId: string, favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return <View style={[styles.row, { backgroundColor: theme.surface }]}>
    <Pressable accessibilityRole="button" style={styles.openSong}
      onPress={() => router.push(`/songs/${encodeURIComponent(song.id)}` as Href)}>
      <SongCover songId={song.id} />
      <View style={styles.main}><Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{song.title}</Text>
      <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>{song.artist ?? '曲师未知'} · {song.version}</Text>
      <SongChartBadges songId={song.id} charts={song.charts} /></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
      disabled={favoritePending} onPress={() => onFavoriteChange(song.id, !favorite)} style={styles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
    </Pressable>
  </View>;
});

const SongChartBadges = memo(function SongChartBadges({ songId, charts }: { songId: string; charts: Chart[] }) {
  return <View testID={`song-chart-badges-${songId}`} accessibilityLabel="谱面定数" style={styles.chartGroups}>
    {TYPES.map((chartType) => {
      const typeCharts = charts.filter((chart) => chart.type === chartType)
        .sort((left, right) => left.levelIndex - right.levelIndex);
      if (!typeCharts.length) return null;
      return <View key={chartType} style={styles.chartGroup}>
        <ChartTypeBadge type={chartType} />
        {typeCharts.map((chart) => <DifficultyBadge key={`${chart.type}-${chart.levelIndex}`}
          difficulty={chart.difficulty} constant={chart.difficultyConstant} display="constant" compact />)}
      </View>;
    })}
  </View>;
});

function songKey(song: Song): string { return song.id; }

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
      <QueryStateView<{ songs: Song[]; source?: DataSource }>
        isLoading={query.isLoading} isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0}
        error={query.error} onRetry={() => void query.refetch()}
        emptyText={hasActiveFilters ? '筛选结果为空' : '暂无曲库数据'}
        data={query.data && filtered.length > 0 ? { songs: filtered, source } : undefined}
        renderData={(result) => (
          <PhigrosCatalogList
            songs={result.songs}
            blurUrls={blurUrls}
            source={result.source}
            tabBottomInset={tabBottomInset}
            favoriteSongIds={favoriteSongIds}
            favoritePending={library.isLoading || library.isUpdating}
            setSongFavorite={library.setSongFavorite}
          />
        )}
      />
    </View>
  );
}

const PhigrosCatalogList = memo(function PhigrosCatalogList({
  songs, blurUrls, source, tabBottomInset, favoriteSongIds, favoritePending, setSongFavorite,
}: {
  songs: Song[];
  blurUrls: Map<string, string>;
  source?: DataSource;
  tabBottomInset: number;
  favoriteSongIds: ReadonlySet<string>;
  favoritePending: boolean;
  setSongFavorite: LibraryHook['setSongFavorite'];
}) {
  const toggleFavorite = useCallback((songId: string, favorite: boolean) => {
    void setSongFavorite(songId, favorite);
  }, [setSongFavorite]);
  const renderItem = useCallback<ListRenderItem<Song>>(({ item }) => (
    <PhigrosSongRow
      song={item}
      blurUrl={blurUrls.get(item.id) ?? null}
      favorite={favoriteSongIds.has(item.id)}
      favoritePending={favoritePending}
      onFavoriteChange={toggleFavorite}
    />
  ), [blurUrls, favoriteSongIds, favoritePending, toggleFavorite]);

  const sourceHeader = useMemo(() => source ? <SourceStatus items={[{
    key: 'catalog', label: source.label, updatedAt: source.updatedAt,
    state: source.isStale ? 'cache' : 'live',
  }]} /> : null, [source]);

  return <FlatList testID="phigros-catalog-results-list"
    data={songs} keyExtractor={songKey} {...TAB_LIST_CACHE_PROPS}
    contentContainerStyle={[styles.listContent, { paddingBottom: tabBottomInset + 20 }]}
    scrollIndicatorInsets={{ bottom: tabBottomInset }}
    ListHeaderComponent={sourceHeader}
    renderItem={renderItem} />;
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  searchArea: { padding: 12, paddingBottom: 8, gap: 6, backgroundColor: '#FFF' },
  searchBox: { ...SEARCH_BOX_STYLE, borderColor: '#D1D5DB', backgroundColor: '#FFF', color: '#111827' },
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
