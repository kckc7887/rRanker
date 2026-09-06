import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewToken } from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { FilterShell } from '@/components/game-content/FilterShell';
import { FilterCheckboxList } from '@/components/game-content/FilterCheckboxList';
import { RangeSelector } from '@/components/game-content/RangeSelector';
import { FilterAnchoredDropdown } from '@/components/FilterAnchoredDropdown';
import { MajdataScoreCard, MajdataSongRow } from '@/components/majdata/MajdataCards';
import { MAJDATA_NAMES, MAJDATA_SORTS, filterMajdataRecords, majdataTags, majdataTime, matchesMajdataSong } from '@/domain/majdata';
import { majdataRecentCard, majdataRecordCard, type MajdataCard } from '@/features/game-content/adapters/majdata';
import { useGameData } from '@/hooks/use-game-data';
import { useMajdataSongs } from '@/hooks/use-majdata';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useMajdataCatalogFilter, useMajdataRecordsFilter } from '@/state/majdata-filters';
import { useAppTheme } from '@/theme/app-theme';

function MajdataFilter({ catalog, tags }: { catalog: boolean; tags: string[] }) {
  const useStore = catalog ? useMajdataCatalogFilter : useMajdataRecordsFilter;
  const filter = useStore(); const [open, setOpen] = useState('');
  return <>
    <GameSearchHeader value={filter.keyword} onChangeText={filter.setKeyword} placeholder="搜索歌曲、曲师、谱师" accessibilityLabel="搜索 Majdata Net" />
    <FilterShell collapsed={filter.collapsed} onCollapsedChange={filter.setCollapsed} onReset={filter.clearFilters}
      summary={[...filter.difficulties.map(i => MAJDATA_NAMES[i]), ...filter.tags, filter.min && `≥${filter.min}%`, filter.max && `≤${filter.max}%`].filter(Boolean).join(' · ') || '全部'}>
      <FilterCheckboxList open={open === 'difficulty'} onOpenChange={v => setOpen(v ? 'difficulty' : '')}
        valueLabel={filter.difficulties.map(i => MAJDATA_NAMES[i]).join(' · ') || '全部'} caption="难度" accessibilityLabel="筛选难度"
        options={MAJDATA_NAMES.map((label, i) => ({ value: String(i), label }))} selectedValues={filter.difficulties.map(String)}
        onValuesChange={values => filter.setDifficulties(values.map(Number))} optionAccessibilityPrefix="难度" />
      <FilterCheckboxList open={open === 'tags'} onOpenChange={v => setOpen(v ? 'tags' : '')} valueLabel={filter.tags.join(' · ') || '全部'}
        caption="线上标签" accessibilityLabel="筛选线上标签" options={[...new Set([...tags, ...filter.tags])].sort().map(tag => ({ value: tag, label: tag }))}
        selectedValues={filter.tags} onValuesChange={filter.setTags} optionAccessibilityPrefix="线上标签" />
      {catalog ? <FilterAnchoredDropdown open={open === 'sort'} onOpenChange={v => setOpen(v ? 'sort' : '')}
        valueLabel={MAJDATA_SORTS.find(s => s.value === filter.sort)?.label ?? '发布时间'} accessibilityLabel="曲库排序" caption="排序"
        options={MAJDATA_SORTS} selectedValue={filter.sort} onSelect={filter.setSort} optionAccessibilityPrefix="排序" />
        : <RangeSelector minimum={0} maximum={101} step={0.0001} lowerValue={filter.min} upperValue={filter.max}
          onLowerValueChange={filter.setMin} onUpperValueChange={filter.setMax} accessibilityLabel="DX 达成率范围" formatValue={v => `${v.toFixed(4)}%`} />}
    </FilterShell>
  </>;
}
function useVisibleCards() {
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken<MajdataCard>[] }) => {
    setVisible(new Set(viewableItems.map(v => v.item.key)));
  }, []);
  return { visible, onViewableItemsChanged };
}
export function MajdataBestScreen() {
  const query = useGameData(); const theme = useAppTheme(); const bottom = useNativeTabBottomInset(); const viewability = useVisibleCards();
  const snapshot = query.data?.payload.kind === 'majdata-net' ? query.data.payload.snapshot : undefined;
  const cards = useMemo(() => [...(snapshot?.recent ?? [])].sort((a, b) => majdataTime(b.timestamp) - majdataTime(a.timestamp)).map(majdataRecentCard), [snapshot?.recent]);
  const sections = useMemo(() => [{ title: 'Recent', data: cards }], [cards]);
  return <View style={{ flex: 1, backgroundColor: theme.background }}><BestListPage data={sections} isLoading={query.isLoading}
    isError={query.isError && !snapshot} error={query.error} isEmpty={!cards.length} emptyText="暂无最近游玩" onRetry={() => void query.refetch()}
    sectionListProps={{ contentContainerStyle: { padding: 16, paddingBottom: bottom, gap: 10 }, keyExtractor: item => item.key,
      onViewableItemsChanged: viewability.onViewableItemsChanged, refreshing: query.isRefetching, onRefresh: () => void query.refetch(),
      renderSectionHeader: () => <Text style={{ color: theme.text, fontWeight: '800', fontSize: 22 }}>Recent</Text>,
      renderItem: ({ item }) => <MajdataScoreCard card={item} username={snapshot?.player.username ?? ''} visible={viewability.visible.has(item.key)} /> }} /></View>;
}
export function MajdataRecordsScreen() {
  const query = useGameData(); const theme = useAppTheme(); const bottom = useNativeTabBottomInset(); const viewability = useVisibleCards();
  const filter = useMajdataRecordsFilter();
  const snapshot = query.data?.payload.kind === 'majdata-net' ? query.data.payload.snapshot : undefined;
  const cards = useMemo(() => filterMajdataRecords(snapshot?.records ?? [], filter).map(majdataRecordCard), [snapshot?.records, filter]);
  const tags = useMemo(() => [...new Set(snapshot?.records.flatMap(s => majdataTags(s.chartInfo)) ?? [])], [snapshot?.records]);
  return <View style={{ flex: 1, backgroundColor: theme.background }}><RecordsListPage data={cards} isLoading={query.isLoading}
    isError={query.isError && !snapshot} error={query.error} isEmpty={!cards.length} emptyText="暂无符合条件的成绩" onRetry={() => void query.refetch()}
    beforeList={<MajdataFilter catalog={false} tags={tags} />}
    flatListProps={{ contentContainerStyle: { padding: 16, paddingBottom: bottom, gap: 10 }, keyExtractor: item => item.key,
      onViewableItemsChanged: viewability.onViewableItemsChanged, refreshing: query.isRefetching, onRefresh: () => void query.refetch(),
      renderItem: ({ item }) => <MajdataScoreCard card={item} username={snapshot?.player.username ?? ''} visible={viewability.visible.has(item.key)} /> }} /></View>;
}
export function MajdataCatalogScreen() {
  const theme = useAppTheme(); const bottom = useNativeTabBottomInset(); const filter = useMajdataCatalogFilter();
  const keyword = useDebouncedValue(filter.keyword);
  const query = useMajdataSongs(filter.sort, keyword);
  const all = useMemo(() => [...new Map((query.data?.pages.flat() ?? []).map(s => [s.id, s])).values()], [query.data?.pages]);
  const songs = useMemo(() => all.filter(s => matchesMajdataSong(s, { ...filter, keyword: '' })), [all, filter]);
  const tags = useMemo(() => [...new Set(all.flatMap(majdataTags))], [all]);
  const more = <View style={{ padding: 16, alignItems: 'center' }}>{query.isFetchingNextPage ? <ActivityIndicator color={theme.accent} />
    : query.hasNextPage ? <Pressable onPress={() => void query.fetchNextPage()}><Text style={{ color: theme.accent }}>加载更多</Text></Pressable>
    : null}</View>;
  return <View style={{ flex: 1, backgroundColor: theme.background }}><CatalogListPage data={songs} isLoading={query.isLoading}
    isError={query.isError && !all.length} error={query.error} isEmpty={!songs.length && !query.hasNextPage} emptyText="暂无符合条件的歌曲"
    beforeList={<MajdataFilter catalog tags={tags} />} onRetry={() => void query.refetch()}
    flatListProps={{ contentContainerStyle: { padding: 16, paddingBottom: bottom, gap: 10 }, keyExtractor: item => item.id,
      renderItem: ({ item }) => <MajdataSongRow song={item} />, onEndReached: () => { if (query.hasNextPage && !query.isFetching) void query.fetchNextPage(); },
      onEndReachedThreshold: 0.4, ListFooterComponent: more, refreshing: query.isRefetching && !query.isFetchingNextPage, onRefresh: () => void query.refetch() }} /></View>;
}
