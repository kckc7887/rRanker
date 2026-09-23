import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { useStableRangeBounds } from '@/components/game-content/RangeSelector';
import { RizlineFilterBar } from '@/components/rizline/RizlineFilterBar';
import { RizlineScoreCard } from '@/components/rizline/RizlineScoreCard';
import { RizlineSongRow } from '@/components/rizline/RizlineSongRow';
import { useNotification } from '@/components/AppNotification';
import { filterRizlineSongs, rizlinePackOptions } from '@/domain/rizline-filters';
import { rizlineCoverUrl, sortRizlineRecords, type RizlineRecord } from '@/domain/rizline';
import { useGameData } from '@/hooks/use-game-data';
import { useRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useRizlineCatalogFilter } from '@/state/rizline-catalog-filter';
import { useAppTheme } from '@/theme/app-theme';
import { buildSearchDocument, searchDocumentMatches } from '@/utils/search';

export function RizlineBestScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset();
  const query = useGameData(); const catalogQuery = useRizlineCatalog();
  const payload = query.data?.payload.kind === 'rizline' ? query.data.payload : undefined;
  const songs = useMemo(() => new Map(catalogQuery.data?.snapshot.songs.map((song) => [song.id, song])), [catalogQuery.data]);
  const sections = useMemo(() => payload ? [
    { key: 'ah5', title: 'AH5（推定）', data: payload.best.ah5 },
    { key: 'b35', title: 'Best35（推定）', data: payload.best.b35 },
  ] : [], [payload]);
  return <View style={[styles.page, { backgroundColor: theme.background }]}><BestListPage<RizlineRecord, typeof sections[number]>
    data={sections.length ? sections : undefined} isLoading={query.isLoading} isError={query.isError} error={query.error}
    isEmpty={!query.isLoading && !sections.some((section) => section.data.length)} emptyText="同步数据后，最佳成绩会显示在这里"
    onRetry={() => void query.refetch()} sectionListProps={{ testID: 'rizline-best-list', style: styles.list,
      contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }],
      ListHeaderComponent: payload?.best.hasUnknownCandidates
        ? <Text style={[styles.inferenceNote, { color: theme.textMuted }]}>部分谱面的数据不足，AH5 与 Best35 的分组尚不能完整推定，贡献值暂显示为 —。</Text> : null,
      scrollIndicatorInsets: { bottom: inset }, keyExtractor: (record) => record.chartId, stickySectionHeadersEnabled: false,
      renderSectionHeader: ({ section }) => <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text><Text style={{ color: theme.textMuted }}>{section.data.length} 条</Text></View>,
      renderItem: ({ item, index }) => { const song = songs.get(item.songId); return <RizlineScoreCard record={item} title={song?.title} rank={index + 1} artworkSource={song ? rizlineCoverUrl(song) : null} />; },
    }} /></View>;
}

export function RizlineRecordsScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const query = useGameData(); const catalogQuery = useRizlineCatalog();
  const [keyword, setKeyword] = useState(''); const debounced = useDebouncedValue(keyword);
  const payload = query.data?.payload.kind === 'rizline' ? query.data.payload : undefined;
  const songs = useMemo(() => new Map(catalogQuery.data?.snapshot.songs.map((song) => [song.id, song])), [catalogQuery.data]);
  const records = useMemo(() => sortRizlineRecords(payload?.records ?? []).filter((record) => {
    const song = songs.get(record.songId);
    return searchDocumentMatches(buildSearchDocument([song?.title ?? record.title, record.songId, song?.artist ?? '']), debounced);
  }), [debounced, payload?.records, songs]);
  return <View style={[styles.page, { backgroundColor: theme.background }]}><RecordsListPage
    beforeList={<GameSearchHeader value={keyword} onChangeText={setKeyword} placeholder="搜索 Rizline 成绩" wrapStyle={styles.searchWrap} inputStyle={styles.search} />}
    data={records.length ? records : undefined} isLoading={query.isLoading} isError={query.isError} error={query.error}
    isEmpty={!query.isLoading && records.length === 0} emptyText={keyword ? '没有符合条件的成绩' : '同步数据后，成绩会显示在这里'}
    emptyActionLabel={keyword ? '清除筛选' : undefined} onEmptyAction={keyword ? () => setKeyword('') : undefined}
    onRetry={() => void query.refetch()} flatListProps={{ testID: 'rizline-records-list', style: styles.list, contentInsetAdjustmentBehavior: 'automatic',
      contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }], scrollIndicatorInsets: { bottom: inset },
      refreshing: query.isFetching, onRefresh: () => void query.refetch(), keyExtractor: (record) => record.chartId,
      renderItem: ({ item }) => { const song = songs.get(item.songId); return <RizlineScoreCard record={item} title={song?.title} artworkSource={song ? rizlineCoverUrl(song) : null} />; },
    }} /></View>;
}

export function RizlineCatalogScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const query = useRizlineCatalog();
  const library = useUserLibrary(); const filter = useRizlineCatalogFilter(); const { showNotification } = useNotification();
  const keyword = useDebouncedValue(filter.keyword);
  const songs = useMemo(() => query.data?.snapshot.songs ?? [], [query.data]);
  const filtered = useMemo(() => filterRizlineSongs(songs, filter, keyword), [filter, keyword, songs]);
  const packs = useMemo(() => rizlinePackOptions(songs), [songs]);
  const constants = useMemo(() => songs.flatMap((song) => song.charts.flatMap((chart) => chart.constant === null ? [] : [chart.constant])), [songs]);
  const bounds = useStableRangeBounds(constants, { minimum: 1, maximum: 16 }, filter.constantMin, filter.constantMax, query.data?.snapshot.resourceVersion ?? 'loading');
  const favorites = useMemo(() => new Set(library.data?.filter((item) => item.kind === 'song' && item.favorite).map((item) => item.songId)), [library.data]);
  return <View style={[styles.page, { backgroundColor: theme.background }]}><CatalogListPage
    beforeList={<><GameSearchHeader value={filter.keyword} onChangeText={filter.setKeyword} placeholder="搜索 Rizline 曲库" wrapStyle={styles.searchWrap} inputStyle={styles.search} />
      <RizlineFilterBar filter={filter} packs={packs} constantBounds={bounds} /></>}
    data={filtered.length ? filtered : undefined} isLoading={query.isLoading} isError={query.isError} error={query.error}
    isEmpty={!query.isLoading && filtered.length === 0} emptyText="没有符合条件的歌曲" onRetry={() => void query.refetch()}
    emptyActionLabel={filter.keyword || filter.difficulty !== 'all' || filter.packId !== 'all' || filter.constantMin || filter.constantMax ? '清除筛选' : undefined}
    onEmptyAction={filter.keyword || filter.difficulty !== 'all' || filter.packId !== 'all' || filter.constantMin || filter.constantMax ? () => filter.clearFilters() : undefined}
    flatListProps={{ testID: 'rizline-catalog-list', style: styles.list, contentInsetAdjustmentBehavior: 'automatic',
      contentContainerStyle: [styles.listContent, { paddingBottom: inset + 16 }], scrollIndicatorInsets: { bottom: inset },
      keyExtractor: (song) => song.id, renderItem: ({ item }) => <RizlineSongRow song={item} favorite={favorites.has(item.id)}
        favoritePending={library.isLoading || library.isUpdating} onFavoriteChange={(songId, favorite) => {
          void library.setSongFavorite(songId, favorite).catch(() => showNotification({ title: '收藏保存失败', message: '请重试。', variant: 'error' }));
        }} />,
    }} /></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, list: { flex: 1 }, listContent: { padding: 16, gap: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '800' }, searchWrap: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  inferenceNote: { fontSize: 12, lineHeight: 18, paddingBottom: 6 },
});
