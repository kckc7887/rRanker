import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { ExampleCatalogScreen } from '@/screens/ExampleScreens';
import { useCallback, useEffect, useMemo } from 'react';
import { type ListRenderItem } from 'react-native';
import { CachedTabScreen } from '@/components/CachedTabScreen';
import { EmptyDataView } from '@/components/EmptyDataView';
import { CatalogListPage } from '@/components/game-content/GameListPages';
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
import { useLocalSearch } from '@/hooks/use-local-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
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
import {
  EMPTY_SONG_FILTERS,
  searchDocumentFor,
  findMatchedAlias,
  searchDocumentMatches,
  matchesSongSearch,
} from '@/utils/search';

export default function SearchTabScreen() {
  return <CachedTabScreen><SearchScreen /></CachedTabScreen>;
}

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
  if (activeGameId === 'example') return <ExampleCatalogScreen />;
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

const chunithmSearchValues = (song: ChunithmSong) => [
  String(song.id), song.title, song.artist ?? '', ...(song.aliases ?? []),
  ...song.difficulties.map((chart) => chart.noteDesigner ?? ''),
];

function ChunithmSearchScreen() {
  const query = useChunithmCatalog();
  const {
    keyword, collapsed, difficulty, version, constantMin, constantMax,
    setKeyword, setCollapsed, setDifficulty, setVersion, setConstantMin, setConstantMax, clearFilters,
  } = useChunithmCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
  const filterSpec = useMemo(() => ({
    keyword: debouncedKeyword,
    difficulty,
    version,
    constantMin,
    constantMax,
  }), [constantMax, constantMin, debouncedKeyword, difficulty, version]);
  const selectSong = useCallback((song: ChunithmSong, filters: typeof filterSpec) => {
    if (!searchDocumentMatches(searchDocumentFor(song, chunithmSearchValues), filters.keyword)) return undefined;
    const difficulties = song.difficulties.filter((chart) => matchesChunithmChartFilter(chart, filters));
    return difficulties.length ? { song, difficulties, matchedAlias: findMatchedAlias(song, filters.keyword) } : undefined;
  }, []);
  const { data: filtered, filter: deferredFilterSpec, isFiltering } = useLocalSearch(query.data?.songs, filterSpec, selectSong);
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
  const controls = <>
    <GameSearchHeader accessibilityLabel="中二节奏歌曲搜索"
      placeholder="曲名 / ID / 别名 / 曲师 / 谱师" value={keyword} onChangeText={setKeyword}
      resultCountText={isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`} />
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
  </>;
  return (
    <CatalogListPage<{ song: ChunithmSong; difficulties: ChunithmSong['difficulties']; matchedAlias?: string }>
      beforeList={controls}
      isLoading={query.isLoading || (isFiltering && filtered.length === 0)}
      isError={query.isError}
      isEmpty={!!query.data && filtered.length === 0}
      error={query.error}
      onRetry={() => void query.refetch()}
      emptyText={hasActiveFilters ? '筛选结果为空' : '暂无曲库数据'}
      data={query.data && filtered.length > 0 ? filtered : undefined}
      flatListProps={{
        testID: 'chunithm-catalog-results-list',
        keyExtractor: (item) => String(item.song.id),
        renderItem: ({ item }) => (
          <ChunithmSongRow
            displayedDifficulties={item.difficulties}
            displayedVersionTitle={selectedVersionTitle}
            matchedAlias={item.matchedAlias}
            song={item.song}
          />
        ),
      }}
    />
  );
}

function PhigrosSearchScreen() {
  const query = usePhigrosCatalog();
  const kyouChartTags = usePhigrosKyouChartTags();
  const library = useUserLibrary();
  const {
    keyword, collapsed, level, constantMin, constantMax, chapter, selectedKyouTagIds,
    setKeyword, setCollapsed, setLevel, setConstantMin, setConstantMax, setChapter,
    setSelectedKyouTagIds, clearFilters,
  } = usePhigrosCatalogFilter();
  const debouncedKeyword = useDebouncedValue(keyword);
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
  const selectSong = useCallback((song: Song, filters: typeof filterSpec) => {
    if (!matchesSongSearch(song, filters,
      kyouChartTags.data && filters.selectedKyouTagIds.length > 0
        ? (candidate, chart) => phigrosKyouChartHasAllTags(
            kyouTagIndex, candidate.id, chart.levelIndex, filters.selectedKyouTagIds,
          )
        : undefined)) return undefined;
    return { song, matchedAlias: findMatchedAlias(song, filters.keyword) };
  }, [kyouChartTags.data, kyouTagIndex]);
  const { data: filtered, isFiltering } = useLocalSearch(query.data?.snapshot.songs, filterSpec, selectSong);
  const favoriteSongIds = useMemo(
    () => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.songId)),
    [library.data],
  );
  const hasActiveFilters = !!(keyword.trim() || level !== 'all' || constantMin || constantMax
    || chapter !== 'all' || selectedKyouTagIds.length);
  const versions = useMemo(() => query.data?.snapshot.versions ?? [], [query.data?.snapshot.versions]);

  const provider = query.data?.provider ?? null;
  const blurUrls = useMemo(() => {
    const map = new Map<string, string>();
    if (!provider) return map;
    for (const { song } of filtered) {
      const url = provider.getIllustrationBlurUrl(song.id);
      if (url) map.set(song.id, url);
    }
    return map;
  }, [filtered, provider]);

  const setSongFavorite = library.setSongFavorite;
  const toggleFavorite = useCallback((songId: string, favorite: boolean) => {
    void setSongFavorite(songId, favorite);
  }, [setSongFavorite]);
  const renderPhigrosItem = useCallback<ListRenderItem<typeof filtered[number]>>(({ item: { song, matchedAlias } }) => (
    <PhigrosSongRow
      song={song}
      blurUrl={blurUrls.get(song.id) ?? null}
      favorite={favoriteSongIds.has(song.id)}
      favoritePending={library.isLoading || library.isUpdating}
      onFavoriteChange={toggleFavorite}
      matchedAlias={matchedAlias}
    />
  ), [
    blurUrls,
    favoriteSongIds,
    library.isLoading,
    library.isUpdating,
    toggleFavorite,
  ]);

  const controls = <>
    <GameSearchHeader accessibilityLabel="歌曲搜索"
      placeholder="曲名 / 别名 / 曲师 / 谱师" value={keyword} onChangeText={setKeyword}
      resultCountText={isFiltering ? '正在筛选…' : `共 ${filtered.length} 首`} />
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
  </>;
  return (
    <CatalogListPage<typeof filtered[number]>
      beforeList={controls}
      isLoading={query.isLoading || (isFiltering && filtered.length === 0)} isError={query.isError}
      isEmpty={!!query.data && filtered.length === 0}
      error={query.error} onRetry={() => void query.refetch()}
      emptyText={hasActiveFilters ? '筛选结果为空' : '暂无曲库数据'}
      data={query.data && filtered.length > 0 ? filtered : undefined}
      flatListProps={{
        testID: 'phigros-catalog-results-list',
        keyExtractor: (item) => item.song.id,
        renderItem: renderPhigrosItem,
      }}
    />
  );
}
