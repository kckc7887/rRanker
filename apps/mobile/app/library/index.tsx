import { useMemo, useState } from 'react';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SongCover } from '@/components/SongCover';
import type { Song } from '@/domain/models';
import type { UserLibraryItem } from '@/domain/user-library';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useAppTheme } from '@/theme/app-theme';

type Mode = 'all' | 'favorite' | 'practice';

export default function UserLibraryScreen() {
  const library = useUserLibrary();
  const theme = useAppTheme();
  const catalog = useDetailedCatalog();
  const [mode, setMode] = useState<Mode>('all');
  const [tag, setTag] = useState<string>();
  const songsById = useMemo(() => new Map((catalog.data?.songs ?? []).map((song) => [song.id, song])), [catalog.data?.songs]);
  const items = useMemo(() => (library.data ?? []).filter((item) => {
    if (mode === 'favorite' && (item.kind !== 'song' || !item.favorite)) return false;
    if (mode === 'practice' && (item.kind !== 'chart' || !item.practice)) return false;
    return !tag || item.tags.includes(tag);
  }), [library.data, mode, tag]);
  const tags = useMemo(() => [...new Set((library.data ?? []).flatMap((item) => item.tags))].sort(), [library.data]);

  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={styles.filters}>
      <View style={styles.chips}>
        <Chip label="全部" active={mode === 'all'} onPress={() => setMode('all')} />
        <Chip label="收藏" active={mode === 'favorite'} onPress={() => setMode('favorite')} />
        <Chip label="练习" active={mode === 'practice'} onPress={() => setMode('practice')} />
      </View>
      {tags.length ? <View style={styles.chips}>
        <Chip label="全部标签" active={!tag} onPress={() => setTag(undefined)} />
        {tags.map((item) => <Chip key={item} label={item} active={tag === item} onPress={() => setTag(tag === item ? undefined : item)} />)}
      </View> : null}
    </View>
    {library.isLoading ? <ActivityIndicator style={styles.center} color={theme.accent} /> : library.isError ?
      <View style={styles.center}><Text style={[styles.error, { color: theme.danger }]}>个人数据加载失败</Text><Pressable onPress={() => void library.refetch()}><Text style={[styles.link, { color: theme.accent }]}>重试</Text></Pressable></View> :
      <FlatList data={items} keyExtractor={(item) => item.key} contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{library.data?.length ? '当前筛选没有项目' : '还没有收藏、练习谱面或本地标签'}</Text>}
        renderItem={({ item }) => <LibraryRow item={item} song={songsById.get(item.songId)} />} />}
  </View>;
}

function LibraryRow({ item, song }: { item: UserLibraryItem; song?: Song }) {
  const theme = useAppTheme();
  const chart = item.kind === 'chart' ? song?.charts.find((value) => value.type === item.type && value.levelIndex === item.levelIndex) : undefined;
  return <Pressable accessibilityRole="button" onPress={() => router.push(`/songs/${encodeURIComponent(item.songId)}` as Href)} style={[styles.row, { backgroundColor: theme.surface }]}>
    <SongCover songId={item.songId} />
    <View style={styles.main}>
      <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{song?.title ?? `歌曲 ID ${item.songId}`}</Text>
      <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.kind === 'song' ? (item.favorite ? '已收藏歌曲' : '歌曲标签') :
        `${item.practice ? '练习谱面' : '谱面标签'} · ${item.type} ${chart?.difficulty.toUpperCase() ?? `难度 ${item.levelIndex}`}`}</Text>
      {!song ? <Text style={styles.warning}>曲库暂不可用，个人数据已保留</Text> : null}
      {item.tags.length ? <Text numberOfLines={2} style={[styles.tagsText, { color: theme.accent }]}>{item.tags.join(' · ')}</Text> : null}
    </View>
  </Pressable>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useAppTheme();
  return <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: theme.surfaceMuted }, active && { backgroundColor: theme.accent }]}><Text style={[styles.chipText, { color: theme.textSecondary }, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, filters: { padding: 12, gap: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#E5E7EB', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6 }, chipActive: { backgroundColor: '#246BFD' },
  chipText: { color: '#374151', fontSize: 11 }, chipTextActive: { color: '#FFF' }, list: { padding: 12, paddingTop: 2, gap: 9, flexGrow: 1 },
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '700' }, meta: { color: '#4B5563', fontSize: 11 }, tagsText: { color: '#246BFD', fontSize: 11 },
  warning: { color: '#B45309', fontSize: 11 }, empty: { color: '#6B7280', textAlign: 'center', marginTop: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, error: { color: '#B42318' }, link: { color: '#246BFD', fontWeight: '600' },
});
