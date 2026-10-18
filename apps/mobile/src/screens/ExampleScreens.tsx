import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BestListPage, CatalogListPage, RecordsListPage } from '@/components/game-content/GameListPages';
import { GameSearchHeader } from '@/components/game-content/GameSearchHeader';
import { ExampleScoreCard, ExampleSongRow } from '@/components/example/ExampleSongContent';
import { EXAMPLE_SONGS, type ExampleRecord } from '@/domain/example';
import { useGameData } from '@/hooks/use-game-data';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';

export function ExampleBestScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const query = useGameData();
  const sections = query.data?.payload.kind === 'example' ? query.data.payload.bestSections : undefined;
  return <View style={[styles.page, { backgroundColor: theme.background }]}><BestListPage<ExampleRecord, NonNullable<typeof sections>[number]>
    data={sections} isLoading={query.isPending} isError={query.isError} error={query.error} isEmpty={!sections?.length}
    emptyText="同步数据后，最佳成绩会显示在这里" onRetry={() => void query.refetch()}
    sectionListProps={{ contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.content, { paddingBottom: inset + 16 }],
      scrollIndicatorInsets: { bottom: inset }, keyExtractor: record => record.song.id, stickySectionHeadersEnabled: false,
      renderSectionHeader: ({ section }) => <View style={styles.section}><Text style={[styles.title, { color: theme.text }]}>{section.title}</Text>
        <Text style={{ color: theme.textMuted }}>{section.data.reduce((total, record) => total + record.rating, 0)}</Text></View>,
      renderItem: ({ item, index }) => <ExampleScoreCard record={item} rank={index + 1} />,
    }} /></View>;
}

export function ExampleRecordsScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const query = useGameData();
  const records = query.data?.payload.kind === 'example' ? query.data.payload.records : undefined;
  return <View style={[styles.page, { backgroundColor: theme.background }]}><RecordsListPage
    data={records} isLoading={query.isPending} isError={query.isError} error={query.error} isEmpty={!records?.length}
    emptyText="同步数据后，成绩会显示在这里" onRetry={() => void query.refetch()}
    flatListProps={{ contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.content, { paddingBottom: inset + 16 }],
      scrollIndicatorInsets: { bottom: inset }, refreshing: query.isFetching, onRefresh: () => void query.refetch(),
      keyExtractor: record => record.song.id, renderItem: ({ item }) => <ExampleScoreCard record={item} />,
    }} /></View>;
}

export function ExampleCatalogScreen() {
  const theme = useAppTheme(); const inset = useNativeTabBottomInset(); const library = useUserLibrary();
  const [keyword, setKeyword] = useState('');
  const songs = useMemo(() => EXAMPLE_SONGS.filter(song => `${song.title} ID${song.id}`.toLowerCase().includes(keyword.trim().toLowerCase())), [keyword]);
  const favorites = new Set(library.data?.filter(item => item.kind === 'song' && item.favorite).map(item => item.songId));
  return <View style={[styles.page, { backgroundColor: theme.background }]}><CatalogListPage
    beforeList={<GameSearchHeader value={keyword} onChangeText={setKeyword} placeholder="搜索曲名或 ID" wrapStyle={styles.searchWrap} inputStyle={styles.search} />}
    data={songs.length ? songs : undefined} isLoading={false} isError={false} isEmpty={!songs.length} emptyText="没有符合条件的歌曲"
    emptyActionLabel={keyword ? '清除搜索' : undefined} onEmptyAction={keyword ? () => setKeyword('') : undefined}
    flatListProps={{ contentInsetAdjustmentBehavior: 'automatic', contentContainerStyle: [styles.content, { paddingBottom: inset + 16 }],
      scrollIndicatorInsets: { bottom: inset }, keyExtractor: song => song.id,
      renderItem: ({ item }) => <ExampleSongRow song={item} favorite={favorites.has(item.id)} pending={library.isLoading || library.isUpdating}
        onFavoriteChange={favorite => { void library.setSongFavorite(item.id, favorite); }} />,
    }} /></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, gap: 10 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: '800' }, searchWrap: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
