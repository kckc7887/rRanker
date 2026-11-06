import { MetricFilterRangeRow } from '@/components/game-content/MetricFilterRows';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { SongListSectionHeader } from '@/components/game-content/SongListSectionHeader';
import { InfinitePageFooter } from '@/components/game-content/InfinitePageFooter';
import { FilterRow, FilterChipFrame, FilterShell, NeutralChip, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import { FilterCheckboxList } from '@/components/game-content/FilterCheckboxList';
import { FilterAnchoredDropdown } from '@/components/FilterAnchoredDropdown';
import { QueryStateView } from '@/components/QueryStateView';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { MajdataDifficultyBadge, MajdataScoreCard, MajdataSongRow } from '@/components/majdata/MajdataCards';
import { MAJDATA_NAMES, MAJDATA_SORTS, filterMajdataRecords, majdataTags, majdataTime, matchesMajdataSong } from '@/domain/majdata';
import { majdataRecentCard, majdataRecordCard, type MajdataCard } from '@/features/game-content/adapters/majdata';
import { useGameData } from '@/hooks/use-game-data';
import { useMajdataSongs, useMajdataDemoScores } from '@/hooks/use-majdata';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useLocalSearch } from '@/hooks/use-local-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMajdataCatalogFilter, useMajdataRecordsFilter } from '@/state/majdata-filters';

export function MajdataFilter({ catalog, tags }: { catalog: boolean; tags: string[] }) {
  const useStore = catalog ? useMajdataCatalogFilter : useMajdataRecordsFilter;
  const filter = useStore();
  const [open, setOpen] = useState('');
  const difficultyLabel = filter.difficulties.map(i => MAJDATA_NAMES[i]).join(' · ') || '全部';
  const tagLabel = filter.tags.join(' · ') || '全部';
  const summary = joinFilterSummary([
    filter.difficulties.length ? difficultyLabel : null,
    filter.tags.length ? `标签 ${tagLabel}` : null,
    !catalog && (filter.min || filter.max) ? `达成率 ${filter.min || '不限'}~${filter.max || '不限'}%` : null,
    catalog && filter.sort !== 'timep' ? MAJDATA_SORTS.find(sort => sort.value === filter.sort)?.label : null,
  ]);
  return <FilterShell collapsed={filter.collapsed} onCollapsedChange={filter.setCollapsed}
    onCollapse={() => { setOpen(''); filter.setCollapsed(true); }}
    onReset={() => { setOpen(''); filter.clearFilters(); }} summary={summary}>
    <FilterRow label="难度" testID="majdata-filter-difficulty-row">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterShellStyles.chipRow}>
        <NeutralChip label="全部" accessibilityLabel="筛选难度 全部" active={!filter.difficulties.length} onPress={() => filter.setDifficulties([])} />
        {MAJDATA_NAMES.map((label, level) => <FilterChipFrame key={level} active={filter.difficulties.includes(level)}
          accessibilityLabel={`筛选难度 ${label}`} onPress={() => filter.setDifficulties(filter.difficulties.includes(level)
            ? filter.difficulties.filter(value => value !== level) : [...filter.difficulties, level])}>
          <MajdataDifficultyBadge level={level} compact />
        </FilterChipFrame>)}
      </ScrollView>
    </FilterRow>
    <FilterRow label="标签" testID="majdata-filter-tags-row">
      <FilterCheckboxList open={open === 'tags'} onOpenChange={value => setOpen(value ? 'tags' : '')}
        valueLabel={tagLabel} accessibilityLabel={`筛选线上标签，当前 ${tagLabel}`}
        options={[...new Set([...tags, ...filter.tags])].sort().map(tag => ({ value: tag, label: tag }))}
        selectedValues={filter.tags} onValuesChange={filter.setTags} optionAccessibilityPrefix="线上标签" />
    </FilterRow>
    {catalog ? <FilterRow label="排序" testID="majdata-filter-sort-row">
      <FilterAnchoredDropdown open={open === 'sort'} onOpenChange={value => setOpen(value ? 'sort' : '')}
        valueLabel={MAJDATA_SORTS.find(sort => sort.value === filter.sort)?.label ?? '发布时间'} accessibilityLabel="曲库排序"
        options={MAJDATA_SORTS} selectedValue={filter.sort} onSelect={filter.setSort} optionAccessibilityPrefix="排序" />
    </FilterRow> : <MetricFilterRangeRow label="达成率" wide rowTestID="majdata-filter-achievement-row" minimum={0} maximum={101} step={0.0001} lowerValue={filter.min} upperValue={filter.max}
        onLowerValueChange={filter.setMin} onUpperValueChange={filter.setMax} accessibilityLabel="DX 达成率范围"
        testID="majdata-filter-achievement" formatValue={value => `${value.toFixed(4)}%`} />}
  </FilterShell>;
}

export function MajdataBestScreen() {
  const query = useGameData();
  const active = useCachedTabActive();
  const demo = useMajdataDemoScores();
  const snapshot = query.data?.payload.kind === 'majdata-net' ? query.data.payload.snapshot : undefined;
  const cards = useMemo(() => demo.bound ? demo.records.map(majdataRecordCard) : [...(snapshot?.recent ?? [])]
    .sort((a, b) => majdataTime(b.timestamp) - majdataTime(a.timestamp)).map(majdataRecentCard), [demo.bound, demo.records, snapshot?.recent]);
  const sections = useMemo(() => [{ title: demo.bound ? '最佳成绩' : 'Recent', data: cards }], [cards, demo.bound]);
  const displayQuery = demo.bound ? demo : query;
  const fetchNextPage = demo.fetchNextPage;
  useEffect(() => {
    if (active && demo.bound && !cards.length && demo.hasNextPage && !demo.isFetching && !demo.isError) void fetchNextPage();
  }, [active, cards.length, demo.bound, demo.hasNextPage, demo.isFetching, demo.isError, fetchNextPage]);
  return <BestListPage<MajdataCard, typeof sections[number]> data={cards.length || (demo.bound && demo.hasNextPage) ? sections : undefined}
      isLoading={demo.bound ? demo.isPending : query.isLoading}
      isError={demo.bound ? demo.isError && !cards.length : query.isError && !snapshot}
      error={displayQuery.error} isEmpty={!cards.length && !(demo.bound && demo.hasNextPage)}
      emptyText={demo.bound ? '暂无最佳成绩' : '暂无最近游玩'} onRetry={() => void displayQuery.refetch()}
      sectionListProps={{ testID: 'majdata-recent-results-list',
        keyExtractor: item => item.key,
        refreshing: displayQuery.isRefetching && !demo.isFetchingNextPage, onRefresh: () => void displayQuery.refetch(),
        onEndReached: () => { if (active && demo.bound && demo.hasNextPage && !demo.isFetching && !demo.isError) void fetchNextPage(); },
        onEndReachedThreshold: 0.4,
        ListFooterComponent: demo.bound ? <InfinitePageFooter loading={demo.isFetchingNextPage} failed={demo.isFetchNextPageError}
          hasNextPage={demo.hasNextPage === true} onRetry={() => void fetchNextPage()} /> : undefined,
        renderSectionHeader: ({ section }) => <SongListSectionHeader title={section.title} value={`${section.data.length} 张谱面`} />,
        renderItem: ({ item, index }) => <MajdataScoreCard card={item} username={snapshot?.player.username ?? ''}
          position={index + 1} /> }} />;
}

export function MajdataRecordsScreen() {
  const query = useGameData();
  const active = useCachedTabActive();
  const demo = useMajdataDemoScores();
  const filter = useMajdataRecordsFilter();
  const keyword = useDebouncedValue(filter.keyword);
  const snapshot = query.data?.payload.kind === 'majdata-net' ? query.data.payload.snapshot : undefined;
  const sourceRecords = demo.bound ? demo.records : snapshot?.records;
  const sortedRecords = useMemo(() => demo.bound ? demo.records : filterMajdataRecords(snapshot?.records ?? [], {
    difficulties: [], tags: [], min: '', max: '', keyword: '', sort: '',
  }), [demo.bound, demo.records, snapshot?.records]);
  const searchFilter = useMemo(() => ({
    difficulties: filter.difficulties, tags: filter.tags, min: filter.min, max: filter.max, keyword, sort: '',
  }), [filter.difficulties, filter.tags, filter.min, filter.max, keyword]);
  const selectRecord = useCallback((record: typeof sortedRecords[number], filters: typeof searchFilter) =>
    filterMajdataRecords([record], filters).length ? majdataRecordCard(record) : undefined, []);
  const { data: cards, isFiltering } = useLocalSearch(sortedRecords, searchFilter, selectRecord);
  const tags = useMemo(() => [...new Set(sourceRecords?.flatMap(score => majdataTags(score.chartInfo)) ?? [])], [sourceRecords]);
  const displayQuery = demo.bound ? demo : query;
  const fetchNextPage = demo.fetchNextPage;
  useEffect(() => {
    if (active && demo.bound && !cards.length && demo.hasNextPage && !demo.isFetching && !demo.isError) void fetchNextPage();
  }, [active, cards.length, demo.bound, demo.hasNextPage, demo.isFetching, demo.isError, fetchNextPage]);
  const controls = <>
    <GameSearchHeader value={filter.keyword} onChangeText={filter.setKeyword}
    placeholder="曲名 / 曲师 / 谱师" accessibilityLabel="成绩搜索" />
    <MajdataFilter catalog={false} tags={tags} />
  </>;
  return <RecordsListPage beforeList={controls}
    data={cards.length || (demo.bound && demo.hasNextPage) ? cards : undefined}
      isLoading={(demo.bound ? demo.isPending : query.isLoading) || (isFiltering && cards.length === 0)}
      isError={demo.bound ? demo.isError && !sourceRecords?.length : query.isError && !snapshot}
      error={displayQuery.error} isEmpty={!cards.length && !(demo.bound && demo.hasNextPage)}
      emptyText="当前筛选条件下没有成绩" onRetry={() => void displayQuery.refetch()}
      emptyActionLabel={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? '清除筛选' : undefined}
      onEmptyAction={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? () => filter.clearFilters() : undefined}
      count={snapshot ? cards.length : undefined} flatListProps={{ testID: 'majdata-records-results-list',
        keyExtractor: item => item.key,
        refreshing: displayQuery.isRefetching && !demo.isFetchingNextPage, onRefresh: () => void displayQuery.refetch(),
        onEndReached: () => { if (active && demo.bound && demo.hasNextPage && !demo.isFetching && !demo.isError) void fetchNextPage(); },
        onEndReachedThreshold: 0.4,
        ListFooterComponent: demo.bound ? <InfinitePageFooter loading={demo.isFetchingNextPage} failed={demo.isFetchNextPageError}
          hasNextPage={demo.hasNextPage === true} onRetry={() => void fetchNextPage()} /> : undefined,
        renderItem: ({ item }) => <MajdataScoreCard card={item} username={snapshot?.player.username ?? ''} /> }} />;
}

export function MajdataCatalogScreen() {
  const active = useCachedTabActive();
  const filter = useMajdataCatalogFilter();
  const library = useUserLibrary();
  const keyword = useDebouncedValue(filter.keyword);
  const query = useMajdataSongs(filter.sort, keyword);
  const all = useMemo(() => [...new Map((query.data?.pages.flat() ?? []).map(song => [song.id, song])).values()], [query.data?.pages]);
  const songs = useMemo(() => all.filter(song => matchesMajdataSong(song, { ...filter, keyword: '' })), [all, filter]);
  const tags = useMemo(() => [...new Set(all.flatMap(majdataTags))], [all]);
  const favorites = useMemo(() => new Set(library.data?.filter(item => item.kind === 'song' && item.favorite).map(item => item.songId)), [library.data]);
  const setSongFavorite = library.setSongFavorite;
  const onFavoriteChange = useCallback((songId: string, favorite: boolean) => { void setSongFavorite(songId, favorite); }, [setSongFavorite]);
  const fetchNextPage = query.fetchNextPage;
  /** 本页无匹配时继续请求下一页。 */
  useEffect(() => {
    if (active && !songs.length && query.hasNextPage && !query.isFetching && !query.isError) void fetchNextPage();
  }, [active, fetchNextPage, query.hasNextPage, query.isError, query.isFetching, songs.length]);
  const footer = query.isFetchNextPageError ? <QueryStateView isLoading={false} isError isEmpty={false}
    error={query.error} data={undefined} onRetry={() => void query.fetchNextPage()} renderData={() => <></>} />
    : query.isFetchingNextPage ? <ActivityIndicator /> : null;
  const controls = <>
    <GameSearchHeader value={filter.keyword} onChangeText={filter.setKeyword}
    placeholder="曲名 / ID / 曲师 / 谱师" accessibilityLabel="歌曲搜索" resultCountText={`已加载 ${all.length} 首`} />
    <MajdataFilter catalog tags={tags} />
  </>;
  return <CatalogListPage beforeList={controls}
    data={songs.length || query.hasNextPage ? songs : undefined} isLoading={query.isLoading}
      isError={query.isError && !all.length} error={query.error} isEmpty={!songs.length && !query.hasNextPage}
      emptyText="当前筛选条件下没有歌曲" onRetry={() => void query.refetch()}
      emptyActionLabel={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? '清除筛选' : undefined}
      onEmptyAction={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? () => filter.clearFilters() : undefined}
      flatListProps={{ testID: 'majdata-catalog-results-list',
        keyExtractor: item => item.id,
        renderItem: ({ item }) => <MajdataSongRow song={item} favorite={favorites.has(item.id)}
          favoritePending={library.isLoading || library.isUpdating} onFavoriteChange={onFavoriteChange} />,
        onEndReached: () => { if (active && query.hasNextPage && !query.isFetching && !query.isError) void query.fetchNextPage(); },
        onEndReachedThreshold: 0.4, ListFooterComponent: footer,
        refreshing: query.isRefetching && !query.isFetchingNextPage, onRefresh: () => void query.refetch() }} />;
}
