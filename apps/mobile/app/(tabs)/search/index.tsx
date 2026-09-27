import { useCallback, useDeferredValue, useEffect, useMemo } from 'react';
import { Text, TextInput, View, type ListRenderItem } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CatalogListPage } from '@/components/game-content/GameListPages';
import { SIMAI_CATALOG_LIST_STYLES as styles } from '@/components/game-content/SimaiListStyles';
import { ChunithmFilterBar } from '@/components/chunithm/ChunithmFilterBar';
import { ChunithmSongRow } from '@/components/chunithm/ChunithmSongRow';
import { PhigrosFilterBar } from '@/components/phigros/PhigrosFilterBar';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import type { ChunithmSong } from '@/domain/chunithm';
import { matchesChunithmChartFilter } from '@/domain/chunithm-filters';
import { isOsuGameId } from '@/domain/game-mode-family';
import { parseConstantBound } from '@/domain/maimai-filters';
import type { Song } from '@/domain/models';
import { phigrosLevelToDifficulty } from '@/domain/phigros-filters';
import { buildPhigrosKyouChartTagIndex, phigrosKyouChartHasAllTags } from '@/domain/phigros-kyou';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { usePhigrosKyouChartTags } from '@/hooks/use-phigros-kyou';
import { useUserLibrary } from '@/hooks/use-user-library';
import { MajdataCatalogScreen } from '@/screens/MajdataScreens';
import { MaimaiCatalogScreen } from '@/screens/maimai/MaimaiCatalogScreen';
import { MuseDashCatalogScreen } from '@/screens/MuseDashScreens';
import { OsuCatalogScreen } from '@/screens/OsuScreens';
import { PhiraCatalogScreen } from '@/screens/PhiraScreens';
import { RizlineCatalogScreen } from '@/screens/RizlineScreens';
import { TufSearchScreen } from '@/screens/TufScreens';
import { useChunithmCatalogFilter } from '@/state/chunithm-catalog-filter';
import { usePhigrosCatalogFilter } from '@/state/phigros-catalog-filter';
import { useSession, UNBOUND_ACCOUNT_ID } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import {
  EMPTY_SONG_FILTERS,
  buildSearchDocument,
  buildSongSearchIndex,
  findMatchedAlias,
  searchDocumentMatches,
  searchSongs,
} from '@/utils/search';

export default function SearchTabScreen() {
  return <CachedTabScreen><SearchScreen /></CachedTabScreen>;
}

/** 曲库标签页只做「选游戏 → 挂载对应页面」；舞萌页面自带自己的查询、筛选与派生链。 */
export function SearchScreen() {
  const activeGameId = useSession((s) => s.activeGameId);
  const activeAccountId = useSession((s) => s.activeAccountId);

  if (activeAccountId === UNBOUND_ACCOUNT_ID) {
    return <EmptyDataView title="暂无绑定账号" detail="请先在设置 → 游戏管理中绑定账号" showBindAction />;
  }

  if (activeGameId === 'maimai') {
    return <MaimaiCatalogScreen />;
  }

  if (activeGameId === 'phigros') {
    return <PhigrosSearchScreen />;
  }
  if (activeGameId === 'majdata-net') return <MajdataCatalogScreen />;
  if (activeGameId === 'phira') return <PhiraCatalogScreen />;
  if (activeGameId === 'rizline') return <RizlineCatalogScreen />;

  if (isOsuGameId(activeGameId)) return <OsuCatalogScreen />;

  if (activeGameId === 'chunithm') {
    return <ChunithmSearchScreen />;
  }

  if (activeGameId === 'adofai') {
    return <TufSearchScreen />;
  }

  if (activeGameId === 'musedash') {
    return <MuseDashCatalogScreen />;
  }

  return <EmptyDataView title="暂无曲库" detail="当前游戏暂未接入曲库数据" />;
}

function chunithmMatchedAlias(song: ChunithmSong, keyword: string): string | undefined {
  if (searchDocumentMatches(buildSearchDocument([song.title]), keyword)) return undefined;
  for (const alias of song.aliases ?? []) {
    if (searchDocumentMatches(buildSearchDocument([alias]), keyword)) return alias;
  }
  return undefined;
}

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
        ...(song.aliases ?? []),
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
  const matchedAliasBySongId = useMemo(() => {
    if (!debouncedKeyword.trim()) return null;
    const map = new Map<number, string>();
    for (const { song } of filtered) {
      const alias = chunithmMatchedAlias(song, debouncedKeyword);
      if (alias) map.set(song.id, alias);
    }
    return map;
  }, [debouncedKeyword, filtered]);
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
          placeholder="曲名 / ID / 别名 / 曲师 / 谱师"
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
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 20 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          renderItem: ({ item }) => (
            <ChunithmSongRow
              displayedDifficulties={item.difficulties}
              displayedVersionTitle={selectedVersionTitle}
              matchedAlias={matchedAliasBySongId?.get(item.song.id)}
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
  const kyouChartTags = usePhigrosKyouChartTags();
  const library = useUserLibrary();
  const tabBottomInset = useNativeTabBottomInset();
  const theme = useAppTheme();
  const {
    keyword, collapsed, level, constantMin, constantMax, chapter, selectedKyouTagIds,
    setKeyword, setCollapsed, setLevel, setConstantMin, setConstantMax, setChapter,
    setSelectedKyouTagIds, clearFilters,
  } = usePhigrosCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const index = useMemo(() => buildSongSearchIndex(query.data?.snapshot.songs ?? []), [query.data?.snapshot.songs]);
  const kyouTagIndex = useMemo(() => buildPhigrosKyouChartTagIndex(
    kyouChartTags.data,
    query.data?.snapshot,
  ), [kyouChartTags.data, query.data?.snapshot]);
  useEffect(() => {
    if (selectedKyouTagIds.length === 0) return;
    if (kyouChartTags.data) {
      const validIds = new Set(kyouChartTags.data.tags.map((tag) => tag.id));
      const next = selectedKyouTagIds.filter((tagId) => validIds.has(tagId));
      if (next.length !== selectedKyouTagIds.length) setSelectedKyouTagIds(next);
    } else if (kyouChartTags.isError) {
      setSelectedKyouTagIds([]);
    }
  }, [kyouChartTags.data, kyouChartTags.isError, selectedKyouTagIds, setSelectedKyouTagIds]);
  const filterSpec = useMemo(() => ({
    ...EMPTY_SONG_FILTERS,
    keyword: debouncedKeyword,
    difficulties: level === 'all' ? [] : [phigrosLevelToDifficulty(level)],
    constantMin: parseConstantBound(constantMin),
    constantMax: parseConstantBound(constantMax),
    chartVersionIds: chapter === 'all' ? [] : [Number(chapter)],
    selectedKyouTagIds,
  }), [chapter, constantMax, constantMin, debouncedKeyword, level, selectedKyouTagIds]);
  const deferredFilterSpec = useDeferredValue(filterSpec);
  const filtered = useMemo(() => searchSongs(
    index,
    deferredFilterSpec,
    kyouChartTags.data && deferredFilterSpec.selectedKyouTagIds.length > 0
      ? (song, chart) => phigrosKyouChartHasAllTags(
          kyouTagIndex,
          song.id,
          chart.levelIndex,
          deferredFilterSpec.selectedKyouTagIds,
        )
      : undefined,
  ), [deferredFilterSpec, index, kyouChartTags.data, kyouTagIndex]);
  const isFiltering = filterSpec !== deferredFilterSpec;
  const favoriteSongIds = useMemo(
    () => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.songId)),
    [library.data],
  );
  const matchedAliasById = useMemo(() => {
    if (!debouncedKeyword.trim()) return null;
    return new Map(filtered.flatMap((song) => {
      const alias = findMatchedAlias(song, debouncedKeyword);
      return alias ? [[song.id, alias] as const] : [];
    }));
  }, [debouncedKeyword, filtered]);
  const hasActiveFilters = !!(keyword.trim() || level !== 'all' || constantMin || constantMax
    || chapter !== 'all' || selectedKyouTagIds.length);
  const versions = useMemo(() => query.data?.snapshot.versions ?? [], [query.data?.snapshot.versions]);

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
      matchedAlias={matchedAliasById?.get(item.id)}
    />
  ), [
    blurUrls,
    favoriteSongIds,
    library.isLoading,
    library.isUpdating,
    matchedAliasById,
    toggleFavorite,
  ]);

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <View style={[styles.searchArea, { backgroundColor: theme.surface }]}>
        <TextInput accessibilityLabel="歌曲搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / 别名 / 曲师 / 谱师" placeholderTextColor={theme.textMuted}
          value={keyword} onChangeText={setKeyword}
          style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} />
        <Text style={styles.resultCount}>{isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`}</Text>
      </View>
      <PhigrosFilterBar
        collapsed={collapsed} onCollapsedChange={setCollapsed}
        level={level} constantMin={constantMin} constantMax={constantMax}
        onLevelChange={setLevel} onConstantMinChange={setConstantMin} onConstantMaxChange={setConstantMax}
        chapter={chapter} versions={versions} onChapterChange={setChapter}
        kyouTags={kyouChartTags.data?.tags ?? []}
        selectedKyouTagIds={selectedKyouTagIds}
        kyouTagState={kyouChartTags.data ? 'ready' : kyouChartTags.isLoading ? 'loading' : 'unavailable'}
        onKyouTagIdsChange={setSelectedKyouTagIds}
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
          contentInsetAdjustmentBehavior: 'automatic',
          keyExtractor: songKey,
          contentContainerStyle: [styles.listContent, { paddingBottom: tabBottomInset + 20 }],
          scrollIndicatorInsets: { bottom: tabBottomInset },
          renderItem: renderPhigrosItem,
        }}
      />
    </View>
  );
}

function songKey(song: Song): string { return song.id; }
