import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, type ListRenderItem } from 'react-native';
import { EmptyDataView } from '@/components/EmptyDataView';
import { MaimaiFilterBar, type VersionFilterOption } from '@/components/MaimaiFilterBar';
import { QueryStateView } from '@/components/QueryStateView';
import { ChartTypeBadge, DifficultyBadge } from '@/components/ScoreVisuals';
import { SongCover } from '@/components/SongCover';
import { SourceStatus } from '@/components/SourceStatus';
import { parseConstantBound } from '@/domain/maimai-filters';
import type { Chart, ChartType, DataSource, Difficulty, Song } from '@/domain/models';
import type { VersionNameLocale } from '@/domain/version-names';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { songLibraryKey } from '@/domain/user-library';
import { useSession } from '@/state/session-store';
import { buildSongSearchIndex, EMPTY_SONG_FILTERS, searchSongs } from '@/utils/search';

const TYPES: ChartType[] = ['SD', 'DX'];
type LibraryHook = ReturnType<typeof useUserLibrary>;

export default function SearchScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const query = useDetailedCatalog();
  const tabBottomInset = useNativeTabBottomInset();
  const library = useUserLibrary();
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<ChartType | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [constantMin, setConstantMin] = useState('');
  const [constantMax, setConstantMax] = useState('');
  const [version, setVersion] = useState<string | 'all'>('all');
  const [versionLocale, setVersionLocale] = useState<VersionNameLocale>('china');
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
  const favoriteKeys = useMemo(() => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.key)), [library.data]);

  if (activeGameId !== 'maimai') {
    return <EmptyDataView title="暂无曲库" detail="空空空" />;
  }

  return (
    <View style={styles.page}>
      <View style={styles.searchArea}>
        <TextInput accessibilityLabel="歌曲搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / ID / 别名 / 曲师 / 谱师" value={keyword} onChangeText={setKeyword} style={styles.searchBox} />
        <Text style={styles.resultCount}>{isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`}</Text>
      </View>
      <MaimaiFilterBar difficulty={difficulty} version={version} type={type}
        constantMin={constantMin} constantMax={constantMax} versionLocale={versionLocale} versions={versions}
        onDifficultyChange={setDifficulty} onVersionChange={setVersion} onTypeChange={setType}
        onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        onVersionLocaleChange={setVersionLocale} />
      <QueryStateView<{ songs: Song[]; source: DataSource }> isLoading={query.isLoading} isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0}
        error={query.error} onRetry={() => void query.refetch()} emptyText={keyword.trim() ? '筛选结果为空' : '暂无曲库数据'}
        data={viewData} renderData={(result) => (
          <CatalogResultsList songs={result.songs} source={result.source} tabBottomInset={tabBottomInset}
            favoriteKeys={favoriteKeys} favoritePending={library.isLoading || library.isUpdating}
            setSongFavorite={library.setSongFavorite} />
        )} />
    </View>
  );
}

const CatalogResultsList = memo(function CatalogResultsList({
  songs,
  source,
  tabBottomInset,
  favoriteKeys,
  favoritePending,
  setSongFavorite,
}: {
  songs: Song[];
  source: DataSource;
  tabBottomInset: number;
  favoriteKeys: ReadonlySet<string>;
  favoritePending: boolean;
  setSongFavorite: LibraryHook['setSongFavorite'];
}) {
  const toggleFavorite = useCallback((songId: string, favorite: boolean) => {
    void setSongFavorite(songId, favorite);
  }, [setSongFavorite]);
  const renderItem = useCallback<ListRenderItem<Song>>(({ item }) => {
    const favorite = favoriteKeys.has(songLibraryKey(item.id));
    return <CatalogSongRow song={item} favorite={favorite} favoritePending={favoritePending}
      onFavoriteChange={toggleFavorite} />;
  }, [favoriteKeys, favoritePending, toggleFavorite]);
  const sourceHeader = useMemo(() => <SourceStatus items={[{
    key: 'catalog', label: source.label, updatedAt: source.updatedAt,
    state: source.isStale ? 'cache' : 'live',
  }]} />, [source]);

  return <FlatList testID="catalog-results-list" contentInsetAdjustmentBehavior="automatic"
    data={songs} keyExtractor={songKey} initialNumToRender={8} maxToRenderPerBatch={8}
    updateCellsBatchingPeriod={40} windowSize={5} removeClippedSubviews
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
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" style={styles.openSong}
      onPress={() => router.push(`/songs/${encodeURIComponent(song.id)}` as Href)}>
      <SongCover songId={song.id} />
      <View style={styles.main}><Text numberOfLines={2} style={styles.title}>{song.title}</Text>
      <Text numberOfLines={1} style={styles.meta}>{song.artist ?? '曲师未知'} · {song.version}</Text>
      <SongChartBadges songId={song.id} charts={song.charts} /></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
      disabled={favoritePending} onPress={() => onFavoriteChange(song.id, !favorite)} style={styles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color="#246BFD" size={24} />
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
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, searchArea: { padding: 12, paddingBottom: 8, gap: 6, backgroundColor: '#FFF' },
  searchBox: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 11, backgroundColor: '#FFF', color: '#111827' },
  resultCount: { color: '#6B7280', fontSize: 11 },
  listContent: { paddingHorizontal: 12, paddingBottom: 20, gap: 9 }, row: { backgroundColor: '#FFF', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openSong: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3 }, title: { color: '#111827', fontWeight: '700' }, meta: { color: '#6B7280', fontSize: 11 },
  chartGroups: { gap: 4 },
  chartGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
});
