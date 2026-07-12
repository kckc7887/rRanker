import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import type { Song } from '@/domain/models';
import { useSongs } from '@/hooks/use-songs';
import { filterSongs } from '@/utils/search';

function chartTypes(song: Song): string {
  return Array.from(new Set(song.charts.map((c) => c.type))).join('/');
}

export default function SearchScreen() {
  const { data, isLoading, isError, isDataStale, error, refetch } = useSongs();
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo<Song[]>(() => (data ? filterSongs(data, keyword) : []), [data, keyword]);

  const viewData = filtered.length > 0 ? filtered : undefined;
  const isEmpty = !!data && filtered.length === 0;

  return (
    <View style={styles.page}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="按曲名或 songId 搜索"
        value={keyword}
        onChangeText={setKeyword}
        style={styles.searchBox}
      />
      <QueryStateView<Song[]>
        isLoading={isLoading}
        isError={isError}
        isEmpty={isEmpty}
        isStale={isDataStale}
        error={error}
        onRetry={refetch ? () => void refetch() : undefined}
        emptyText={keyword.trim() ? '没有匹配的歌曲' : '暂无歌曲数据'}
        data={viewData}
        renderData={(list) => (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={list}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.main}>
                  <Text numberOfLines={1} style={styles.title}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {item.artist ? `${item.artist} · ` : ''}{item.version} · {chartTypes(item)}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  searchBox: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    margin: 16,
    color: '#111827',
    backgroundColor: '#FFF',
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  row: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '600' },
  meta: { color: '#6B7280', fontSize: 12 },
});
