import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { detailHref } from '@rranker/sdk/navigation';
import { FilterAnchoredDropdown } from '@rranker/sdk/components/FilterAnchoredDropdown';
import { NeutralChip } from '@rranker/sdk/components/game-content/FilterShell';
import { GameSongCover } from '@rranker/sdk/components/game-content/GameSongCover';
import { RemoteImageFlatList } from '@rranker/sdk/components/game-content/GameListPages';
import { libraryDetailTarget, type UserLibraryItem } from '@rranker/sdk/domain/user-library';
import type { useUserLibrary } from '@rranker/sdk/hooks/use-user-library';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';

type Mode = 'all' | 'favorite' | 'practice';
const EMPTY_ITEMS: UserLibraryItem[] = [];
export type LibraryItemPresentation = { title: string; chartLabel?: string; cover?: string | null; coverRadius?: number; available: boolean };

export function UserLibraryList({
  library,
  present,
}: {
  library: ReturnType<typeof useUserLibrary>;
  present: (item: UserLibraryItem) => LibraryItemPresentation;
}) {
  const theme = useAppTheme();
  const items = library.data ?? EMPTY_ITEMS;
  const [mode, setMode] = useState<Mode>('all');
  const [tag, setTag] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);
  const selectedTag = tags.includes(tag) ? tag : '';
  useEffect(() => { if (tag && !tags.includes(tag)) setTag(''); }, [tag, tags]);
  const filtered = useMemo(() => items.filter((item) => {
    if (mode === 'favorite' && (item.kind !== 'song' || !item.favorite)) return false;
    if (mode === 'practice' && (item.kind !== 'chart' || !item.practice)) return false;
    return !selectedTag || item.tags.includes(selectedTag);
  }), [items, mode, selectedTag]);

  return <View style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={styles.filters}>
      <View style={styles.chips}>
        <NeutralChip label="全部" active={mode === 'all'} onPress={() => setMode('all')} />
        <NeutralChip label="收藏" active={mode === 'favorite'} onPress={() => setMode('favorite')} />
        <NeutralChip label="练习" active={mode === 'practice'} onPress={() => setMode('practice')} />
      </View>
      {tags.length ? <View style={styles.chips}>
        <FilterAnchoredDropdown open={tagsOpen} onOpenChange={setTagsOpen}
          valueLabel={selectedTag || '全部标签'} accessibilityLabel="筛选本地标签"
          options={[{ value: '', label: '全部标签' }, ...tags.map(value => ({ value, label: value }))]}
          selectedValue={selectedTag} onSelect={setTag} optionAccessibilityPrefix="选择本地标签" />
      </View> : null}
    </View>
    {library.isLoading ? <ActivityIndicator style={styles.center} color={theme.accent} /> : library.isError ?
      <View style={styles.center}><Text style={[styles.error, { color: theme.danger }]}>个人数据加载失败</Text><Pressable onPress={() => void library.refetch()}><Text style={[styles.link, { color: theme.accent }]}>重试</Text></Pressable></View> :
      <RemoteImageFlatList data={filtered} keyExtractor={(item) => item.key} contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{library.data?.length ? '当前筛选没有项目' : '还没有收藏、练习谱面或本地标签'}</Text>}
        renderItem={({ item }) => (
          <LibraryRow
            item={item}
            presentation={present(item)}
          />
        )} />}
  </View>;
}

function LibraryRow({ item, presentation }: { item: UserLibraryItem; presentation: LibraryItemPresentation }) {
  const theme = useAppTheme();
  return <Pressable onPress={() => router.push(detailHref(libraryDetailTarget(item)))} style={[styles.row, { backgroundColor: theme.surface }]}>
    <GameSongCover source={presentation.cover ?? null} gameId={item.gameId} accessibilityLabel="曲绘" borderRadius={presentation.coverRadius ?? 9} />
    <View style={styles.main}>
      <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{presentation.title}</Text>
      <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.kind === 'song' ? (item.favorite ? '已收藏歌曲' : '歌曲标签') :
        `${item.practice ? '练习谱面' : '谱面标签'} · ${presentation.chartLabel ?? '—'}`}</Text>
      {!presentation.available ? <Text style={styles.warning}>曲库暂不可用，个人数据已保留</Text> : null}
      {item.tags.length ? <Text numberOfLines={2} style={[styles.tagsText, { color: theme.accent }]}>{item.tags.join(' · ')}</Text> : null}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' }, filters: { padding: 12, gap: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { padding: 12, paddingTop: 2, gap: 9, flexGrow: 1 },
  row: { backgroundColor: '#FFF', borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 }, main: { flex: 1, gap: 3 },
  title: { color: '#111827', fontWeight: '700' }, meta: { color: '#4B5563', fontSize: 11 }, tagsText: { color: '#246BFD', fontSize: 11 },
  warning: { color: '#B45309', fontSize: 11 }, empty: { color: '#6B7280', textAlign: 'center', marginTop: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, error: { color: '#B42318' }, link: { color: '#246BFD', fontWeight: '600' },
});
