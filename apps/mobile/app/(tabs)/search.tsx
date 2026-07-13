import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { SongCover } from '@/components/SongCover';
import { SourceStatus } from '@/components/SourceStatus';
import type { ChartType, Difficulty, Song } from '@/domain/models';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useUserLibrary } from '@/hooks/use-user-library';
import { songLibraryKey } from '@/domain/user-library';
import { buildSongSearchIndex, EMPTY_SONG_FILTERS, searchSongs } from '@/utils/search';

const TYPES: ChartType[] = ['SD', 'DX'];
const DIFFICULTIES: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];
function toggle<T>(list: T[], value: T): T[] { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]; }

export default function SearchScreen() {
  const query = useDetailedCatalog();
  const library = useUserLibrary();
  const [keyword, setKeyword] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [types, setTypes] = useState<ChartType[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [songVersionId, setSongVersionId] = useState<number>();
  const [chartVersionId, setChartVersionId] = useState<number>();
  const debouncedKeyword = useDebouncedValue(keyword);
  const index = useMemo(() => buildSongSearchIndex(query.data?.songs ?? []), [query.data?.songs]);
  const filtered = useMemo(() => searchSongs(index, {
    ...EMPTY_SONG_FILTERS, keyword: debouncedKeyword, types, difficulties,
    constantMin: min ? Number(min) : undefined, constantMax: max ? Number(max) : undefined,
    songVersionIds: songVersionId ? [songVersionId] : [], chartVersionIds: chartVersionId ? [chartVersionId] : [],
  }), [chartVersionId, debouncedKeyword, difficulties, index, max, min, songVersionId, types]);
  const favoriteKeys = useMemo(() => new Set((library.data ?? []).filter((item) => item.kind === 'song' && item.favorite).map((item) => item.key)), [library.data]);

  return (
    <View style={styles.page}>
      <View style={styles.filters}>
        <TextInput accessibilityLabel="歌曲搜索" autoCapitalize="none" autoCorrect={false}
          placeholder="曲名 / ID / 别名 / 曲师 / 谱师" value={keyword} onChangeText={setKeyword} style={styles.searchBox} />
        <Pressable accessibilityRole="button" onPress={() => setFiltersOpen((open) => !open)} style={styles.filterToggle}>
          <Text style={styles.filterToggleText}>{filtersOpen ? '收起筛选' : '展开复合筛选'} · {filtered.length} 首</Text>
        </Pressable>
        {filtersOpen ? <View style={styles.drawer}><View style={styles.chips}>
          {TYPES.map((item) => <Chip key={item} label={item} active={types.includes(item)} onPress={() => setTypes(toggle(types, item))} />)}
          {DIFFICULTIES.map((item) => <Chip key={item} label={item.slice(0, 3).toUpperCase()} active={difficulties.includes(item)} onPress={() => setDifficulties(toggle(difficulties, item))} />)}
        </View>
        <View style={styles.rangeRow}>
          <TextInput accessibilityLabel="最低定数" autoCorrect={false} placeholder="定数下限" value={min} onChangeText={setMin} style={styles.range} />
          <TextInput accessibilityLabel="最高定数" autoCorrect={false} placeholder="定数上限" value={max} onChangeText={setMax} style={styles.range} />
        </View>
        <View style={styles.chips}>
          <Chip label={songVersionId ? `歌曲版本 ${songVersionId}` : '歌曲版本：全部'} active={!!songVersionId}
            onPress={() => setSongVersionId(nextVersion(query.data?.versions.map((item) => item.id) ?? [], songVersionId))} />
          <Chip label={chartVersionId ? `谱面版本 ${chartVersionId}` : '谱面版本：全部'} active={!!chartVersionId}
            onPress={() => setChartVersionId(nextVersion(query.data?.versions.map((item) => item.id) ?? [], chartVersionId))} />
        </View></View> : null}
      </View>
      <QueryStateView<Song[]> isLoading={query.isLoading} isError={query.isError}
        isEmpty={!!query.data && filtered.length === 0} isStale={!!query.data?.source.isStale}
        error={query.error} onRetry={() => void query.refetch()} emptyText={keyword.trim() ? '筛选结果为空' : '暂无曲库数据'}
        data={filtered.length ? filtered : undefined} renderData={(songs) => (
          <FlatList data={songs} keyExtractor={(item) => item.id} initialNumToRender={12} maxToRenderPerBatch={12}
            windowSize={7} removeClippedSubviews contentContainerStyle={styles.listContent}
            ListHeaderComponent={query.data ? <SourceStatus items={[{
              key: 'catalog', label: query.data.source.label, updatedAt: query.data.source.updatedAt,
              state: query.data.source.isStale ? 'cache' : 'live',
            }]} /> : null}
            renderItem={({ item }) => <View style={styles.row}>
              <Pressable accessibilityRole="button" style={styles.openSong} onPress={() => router.push(`/songs/${encodeURIComponent(item.id)}` as Href)}>
                <SongCover songId={item.id} />
                <View style={styles.main}><Text numberOfLines={2} style={styles.title}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.meta}>{item.artist ?? '曲师未知'} · {item.version}</Text>
                <Text style={styles.meta}>{item.charts.map((chart) => `${chart.type} ${chart.level}`).join(' / ')}</Text></View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={favoriteKeys.has(songLibraryKey(item.id)) ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
                disabled={library.isLoading || library.isUpdating} onPress={() => void library.setSongFavorite(item.id, !favoriteKeys.has(songLibraryKey(item.id)))} style={styles.favorite}>
                <Ionicons name={favoriteKeys.has(songLibraryKey(item.id)) ? 'heart' : 'heart-outline'} color="#246BFD" size={24} />
              </Pressable>
            </View>} />
        )} />
    </View>
  );
}

function nextVersion(ids: number[], current?: number): number | undefined {
  if (!ids.length) return undefined;
  if (!current) return ids[0];
  const index = ids.indexOf(current);
  return index < 0 || index === ids.length - 1 ? undefined : ids[index + 1];
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, filters: { padding: 12, gap: 8 },
  searchBox: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 11, backgroundColor: '#FFF', color: '#111827' },
  filterToggle: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#246BFD', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  filterToggleText: { color: '#246BFD', fontSize: 12, fontWeight: '600' }, drawer: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, chip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 15, backgroundColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#246BFD' }, chipText: { color: '#374151', fontSize: 11 }, chipTextActive: { color: '#FFF' },
  rangeRow: { flexDirection: 'row', gap: 8 }, range: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 8 },
  listContent: { paddingHorizontal: 12, paddingBottom: 20, gap: 9 }, row: { backgroundColor: '#FFF', borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openSong: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 3 }, title: { color: '#111827', fontWeight: '700' }, meta: { color: '#6B7280', fontSize: 11 },
});
