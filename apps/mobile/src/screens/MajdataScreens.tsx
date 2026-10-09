import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { SongListSectionHeader } from '@/components/game-content/SongListSectionHeader';
import { SIMAI_BEST_LIST_STYLES as bestStyles, SIMAI_RECORDS_LIST_STYLES as recordsStyles, SIMAI_CATALOG_LIST_STYLES as catalogStyles } from '@/components/game-content/SimaiListStyles';
import { FilterChipFrame, FilterShell, NeutralChip, filterShellStyles, joinFilterSummary } from '@/components/game-content/FilterShell';
import { FilterCheckboxList } from '@/components/game-content/FilterCheckboxList';
import { RangeSelector } from '@/components/game-content/RangeSelector';
import { FilterAnchoredDropdown } from '@/components/FilterAnchoredDropdown';
import { QueryStateView } from '@/components/QueryStateView';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { MajdataDifficultyBadge, MajdataScoreCard, MajdataSongRow } from '@/components/majdata/MajdataCards';
import { MAJDATA_NAMES, MAJDATA_SORTS, filterMajdataRecords, majdataTags, majdataTime, matchesMajdataSong } from '@/domain/majdata';
import { majdataRecentCard, majdataRecordCard, type MajdataCard } from '@/features/game-content/adapters/majdata';
import { useGameData } from '@/hooks/use-game-data';
import { useMajdataSongs } from '@/hooks/use-majdata';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useLocalSearch } from '@/hooks/use-local-search';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useMajdataCatalogFilter, useMajdataRecordsFilter } from '@/state/majdata-filters';
import { useAppTheme } from '@/theme/app-theme';

export function MajdataFilter({ catalog, tags }: { catalog: boolean; tags: string[] }) {
  const useStore = catalog ? useMajdataCatalogFilter : useMajdataRecordsFilter;
  const filter = useStore();
  const theme = useAppTheme();
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
    <View testID="majdata-filter-difficulty-row" style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>难度</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterShellStyles.chipRow}>
        <NeutralChip label="全部" accessibilityLabel="筛选难度 全部" active={!filter.difficulties.length} onPress={() => filter.setDifficulties([])} />
        {MAJDATA_NAMES.map((label, level) => <FilterChipFrame key={level} active={filter.difficulties.includes(level)}
          accessibilityLabel={`筛选难度 ${label}`} onPress={() => filter.setDifficulties(filter.difficulties.includes(level)
            ? filter.difficulties.filter(value => value !== level) : [...filter.difficulties, level])}>
          <MajdataDifficultyBadge level={level} compact />
        </FilterChipFrame>)}
      </ScrollView>
    </View>
    <View testID="majdata-filter-tags-row" style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>标签</Text>
      <FilterCheckboxList open={open === 'tags'} onOpenChange={value => setOpen(value ? 'tags' : '')}
        valueLabel={tagLabel} accessibilityLabel={`筛选线上标签，当前 ${tagLabel}`}
        options={[...new Set([...tags, ...filter.tags])].sort().map(tag => ({ value: tag, label: tag }))}
        selectedValues={filter.tags} onValuesChange={filter.setTags} optionAccessibilityPrefix="线上标签" />
    </View>
    {catalog ? <View testID="majdata-filter-sort-row" style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, { color: theme.textMuted }]}>排序</Text>
      <FilterAnchoredDropdown open={open === 'sort'} onOpenChange={value => setOpen(value ? 'sort' : '')}
        valueLabel={MAJDATA_SORTS.find(sort => sort.value === filter.sort)?.label ?? '发布时间'} accessibilityLabel="曲库排序"
        options={MAJDATA_SORTS} selectedValue={filter.sort} onSelect={filter.setSort} optionAccessibilityPrefix="排序" />
    </View> : <View testID="majdata-filter-achievement-row" style={filterShellStyles.filterRow}>
      <Text style={[filterShellStyles.filterLabel, filterShellStyles.wideFilterLabel, { color: theme.textMuted }]}>达成率</Text>
      <RangeSelector minimum={0} maximum={101} step={0.0001} lowerValue={filter.min} upperValue={filter.max}
        onLowerValueChange={filter.setMin} onUpperValueChange={filter.setMax} accessibilityLabel="DX 达成率范围"
        testID="majdata-filter-achievement" formatValue={value => `${value.toFixed(4)}%`} />
    </View>}
  </FilterShell>;
}

export function MajdataBestScreen() {
  const query = useGameData();
  const theme = useAppTheme();
  const bottom = useNativeTabBottomInset();
  const snapshot = query.data?.payload.kind === 'majdata-net' ? query.data.payload.snapshot : undefined;
  const cards = useMemo(() => [...(snapshot?.recent ?? [])]
    .sort((a, b) => majdataTime(b.timestamp) - majdataTime(a.timestamp)).map(majdataRecentCard), [snapshot?.recent]);
  const sections = useMemo(() => [{ title: 'Recent', data: cards }], [cards]);
  return <View style={[bestStyles.page, { backgroundColor: theme.background }]}>
    <BestListPage<MajdataCard, typeof sections[number]> data={cards.length ? sections : undefined} isLoading={query.isLoading}
      isError={query.isError && !snapshot} error={query.error} isEmpty={!cards.length}
      emptyText="暂无最近游玩" onRetry={() => void query.refetch()}
      sectionListProps={{ testID: 'majdata-recent-results-list', contentInsetAdjustmentBehavior: 'automatic',
        style: bestStyles.list, contentContainerStyle: [bestStyles.listContent, { paddingBottom: bottom + 16 }],
        scrollIndicatorInsets: { bottom }, stickySectionHeadersEnabled: false, keyExtractor: item => item.key,
        refreshing: query.isRefetching, onRefresh: () => void query.refetch(),
        renderSectionHeader: ({ section }) => <SongListSectionHeader title={section.title} count={section.data.length} />,
        renderItem: ({ item, index }) => <MajdataScoreCard card={item} username={snapshot?.player.username ?? ''}
          position={index + 1} /> }} />
  </View>;
}

export function MajdataRecordsScreen() {
  const query = useGameData();
  const theme = useAppTheme();
  const bottom = useNativeTabBottomInset();
  const filter = useMajdataRecordsFilter();
  const keyword = useDebouncedValue(filter.keyword);
  const snapshot = query.data?.payload.kind === 'majdata-net' ? query.data.payload.snapshot : undefined;
  const sortedRecords = useMemo(() => filterMajdataRecords(snapshot?.records ?? [], {
    difficulties: [], tags: [], min: '', max: '', keyword: '', sort: '',
  }), [snapshot?.records]);
  const searchFilter = useMemo(() => ({ ...filter, keyword }), [filter, keyword]);
  const selectRecord = useCallback((record: typeof sortedRecords[number], filters: typeof searchFilter) =>
    filterMajdataRecords([record], filters).length ? majdataRecordCard(record) : undefined, []);
  const { data: cards, isFiltering } = useLocalSearch(sortedRecords, searchFilter, selectRecord);
  const tags = useMemo(() => [...new Set(snapshot?.records.flatMap(score => majdataTags(score.chartInfo)) ?? [])], [snapshot?.records]);
  return <View style={[recordsStyles.page, { backgroundColor: theme.background }]}>
    <GameSearchHeader layout="records" value={filter.keyword} onChangeText={filter.setKeyword}
      placeholder="曲名 / 曲师 / 谱师" accessibilityLabel="成绩搜索" />
    <MajdataFilter catalog={false} tags={tags} />
    <RecordsListPage data={cards.length ? cards : undefined} isLoading={query.isLoading || (isFiltering && cards.length === 0)}
      isError={query.isError && !snapshot} error={query.error} isEmpty={!cards.length}
      emptyText="当前筛选条件下没有成绩" onRetry={() => void query.refetch()}
      emptyActionLabel={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? '清除筛选' : undefined}
      onEmptyAction={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? () => filter.clearFilters() : undefined}
      flatListProps={{ testID: 'majdata-records-results-list', contentInsetAdjustmentBehavior: 'automatic',
        style: recordsStyles.list, contentContainerStyle: [recordsStyles.listContent, { paddingBottom: bottom + 16 }],
        scrollIndicatorInsets: { bottom }, keyExtractor: item => item.key,
        ListHeaderComponent: snapshot ? <View style={recordsStyles.header}><Text style={recordsStyles.note}>共 {cards.length} 条成绩</Text></View> : null,
        refreshing: query.isRefetching, onRefresh: () => void query.refetch(),
        renderItem: ({ item }) => <MajdataScoreCard card={item} username={snapshot?.player.username ?? ''} /> }} />
  </View>;
}

export function MajdataCatalogScreen() {
  const theme = useAppTheme();
  const active = useCachedTabActive();
  const bottom = useNativeTabBottomInset();
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
  return <View style={[catalogStyles.page, { backgroundColor: theme.background }]}>
    <GameSearchHeader layout="catalog" value={filter.keyword} onChangeText={filter.setKeyword}
      placeholder="曲名 / ID / 曲师 / 谱师" accessibilityLabel="歌曲搜索" resultCountText={`已加载 ${all.length} 首`} />
    <MajdataFilter catalog tags={tags} />
    <CatalogListPage data={songs.length || query.hasNextPage ? songs : undefined} isLoading={query.isLoading}
      isError={query.isError && !all.length} error={query.error} isEmpty={!songs.length && !query.hasNextPage}
      emptyText="当前筛选条件下没有歌曲" onRetry={() => void query.refetch()}
      emptyActionLabel={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? '清除筛选' : undefined}
      onEmptyAction={filter.keyword || filter.difficulties.length || filter.tags.length || filter.min || filter.max ? () => filter.clearFilters() : undefined}
      flatListProps={{ testID: 'majdata-catalog-results-list', contentInsetAdjustmentBehavior: 'automatic',
        contentContainerStyle: [catalogStyles.listContent, { paddingBottom: bottom + 20 }],
        scrollIndicatorInsets: { bottom }, keyExtractor: item => item.id,
        renderItem: ({ item }) => <MajdataSongRow song={item} favorite={favorites.has(item.id)}
          favoritePending={library.isLoading || library.isUpdating} onFavoriteChange={onFavoriteChange} />,
        onEndReached: () => { if (active && query.hasNextPage && !query.isFetching && !query.isError) void query.fetchNextPage(); },
        onEndReachedThreshold: 0.4, ListFooterComponent: footer,
        refreshing: query.isRefetching && !query.isFetchingNextPage, onRefresh: () => void query.refetch() }} />
  </View>;
}
