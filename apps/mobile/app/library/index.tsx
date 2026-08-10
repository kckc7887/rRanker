import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SongCover } from '@/components/SongCover';
import { chunithmJacketUrl } from '@/components/chunithm/ChunithmSongRow';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmSong,
} from '@/domain/chunithm';
import type { Song } from '@/domain/models';
import type { TufLevel } from '@/domain/tuf';
import type { UserLibraryItem } from '@/domain/user-library';
import { useDetailedCatalog } from '@/hooks/use-detailed-catalog';
import { useChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { usePhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { useTufLevelSearch } from '@/hooks/use-tuf';
import { useUserLibrary } from '@/hooks/use-user-library';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

type Mode = 'all' | 'favorite' | 'practice';
type LibrarySong = Song | ChunithmSong | TufLevel;

function isChunithmSong(song: LibrarySong): song is ChunithmSong {
  return 'difficulties' in song;
}

function isTufLevel(song: LibrarySong): song is TufLevel {
  return 'levelCredits' in song;
}

export default function UserLibraryScreen() {
  const activeGameId = useSession((state) => state.activeGameId);
  if (activeGameId === 'adofai') return <AdofaiLibraryScreen />;
  return <SharedLibraryScreen />;
}

function LibraryList({
  items,
  songsById,
  blurUrls,
}: {
  items: UserLibraryItem[];
  songsById: ReadonlyMap<string, LibrarySong>;
  blurUrls?: ReadonlyMap<string, string>;
}) {
  const theme = useAppTheme();
  const library = useUserLibrary();
  const [mode, setMode] = useState<Mode>('all');
  const [tag, setTag] = useState<string>();
  const filtered = useMemo(() => items.filter((item) => {
    if (mode === 'favorite' && (item.kind !== 'song' || !item.favorite)) return false;
    if (mode === 'practice' && (item.kind !== 'chart' || !item.practice)) return false;
    return !tag || item.tags.includes(tag);
  }), [items, mode, tag]);
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags))].sort(), [items]);

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
      <FlatList data={filtered} keyExtractor={(item) => item.key} contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.textMuted }]}>{library.data?.length ? '当前筛选没有项目' : '还没有收藏、练习谱面或本地标签'}</Text>}
        renderItem={({ item }) => (
          <LibraryRow
            item={item}
            song={songsById.get(item.songId)}
            blurUrl={blurUrls?.get(item.songId) ?? null}
          />
        )} />}
  </View>;
}

function SharedLibraryScreen() {
  const activeGameId = useSession((state) => state.activeGameId);
  const maimaiCatalog = useDetailedCatalog();
  const chunithmCatalog = useChunithmCatalog();
  const phigrosCatalog = usePhigrosCatalog();
  const items = useUserLibrary().data ?? [];
  const songsById = useMemo(() => {
    const map = new Map<string, LibrarySong>();
    if (activeGameId === 'chunithm') {
      for (const song of chunithmCatalog.data?.songs ?? []) map.set(String(song.id), song);
    } else if (activeGameId === 'phigros') {
      for (const song of phigrosCatalog.data?.snapshot.songs ?? []) map.set(song.id, song);
    } else {
      for (const song of maimaiCatalog.data?.songs ?? []) map.set(song.id, song);
    }
    return map;
  }, [
    activeGameId,
    chunithmCatalog.data?.songs,
    maimaiCatalog.data?.songs,
    phigrosCatalog.data?.snapshot.songs,
  ]);
  const phigrosBlurUrls = useMemo(() => {
    const map = new Map<string, string>();
    const data = phigrosCatalog.data;
    if (!data) return map;
    const provider = data.provider;
    for (const song of data.snapshot.songs) {
      const url = provider.getIllustrationBlurUrl(song.id);
      if (url) map.set(song.id, url);
    }
    return map;
  }, [phigrosCatalog.data]);
  return <LibraryList items={items} songsById={songsById} blurUrls={phigrosBlurUrls} />;
}

function AdofaiLibraryScreen() {
  const items = useUserLibrary().data ?? [];
  const tufLevelSearch = useTufLevelSearch('', { sort: 'RECENT' });
  const songsById = useMemo(() => {
    const map = new Map<string, LibrarySong>();
    for (const level of tufLevelSearch.data?.pages.flatMap((page) => page.results) ?? []) {
      map.set(String(level.id), level);
    }
    return map;
  }, [tufLevelSearch.data?.pages]);
  return <LibraryList items={items} songsById={songsById} />;
}

function LibraryRow({
  item,
  song,
  blurUrl,
}: {
  item: UserLibraryItem;
  song?: LibrarySong;
  blurUrl: string | null;
}) {
  const theme = useAppTheme();
  const chunithmSong = song && isChunithmSong(song) ? song : undefined;
  const standardSong = song && !isChunithmSong(song) && !isTufLevel(song) ? song : undefined;
  const tufLevel = song && isTufLevel(song) ? song : undefined;
  const chart = item.kind === 'chart'
    ? standardSong?.charts.find((value) => value.type === item.type && value.levelIndex === item.levelIndex)
    : undefined;
  const chunithmDifficulty = item.kind === 'chart'
    ? chunithmSong?.difficulties.find((value) => value.difficulty === item.levelIndex)
    : undefined;
  const songTitle = tufLevel?.song
    ?? (song && !isTufLevel(song) ? song.title : undefined)
    ?? `歌曲 ID ${item.songId}`;
  const chartLabel = item.kind === 'chart'
    ? chunithmDifficulty
      ? CHUNITHM_DIFFICULTY_LABELS[chunithmDifficulty.difficulty]
      : chart
      ? (['EZ', 'HD', 'IN', 'AT'].includes(chart.level)
        ? chart.level
        : `${item.type} ${chart.difficulty.toUpperCase()}`)
      : chunithmSong
        ? `难度 ${item.levelIndex}`
        : `${item.type} 难度 ${item.levelIndex}`
    : '';
  return <Pressable accessibilityRole="button" onPress={() => router.push({
    pathname: '/songs/[songId]',
    params: item.kind === 'chart'
      ? {
          songId: item.songId,
          ...(chunithmSong ? {} : { chartType: item.type }),
          levelIndex: String(item.levelIndex),
        }
      : { songId: item.songId },
  } as Href)} style={[styles.row, { backgroundColor: theme.surface }]}>
    <LibrarySongCover song={song} blurUrl={blurUrl} />
    <View style={styles.main}>
      <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{songTitle}</Text>
      <Text style={[styles.meta, { color: theme.textSecondary }]}>{item.kind === 'song' ? (item.favorite ? '已收藏歌曲' : '歌曲标签') :
        `${item.practice ? '练习谱面' : '谱面标签'} · ${chartLabel}`}</Text>
      {!song ? <Text style={styles.warning}>曲库暂不可用，个人数据已保留</Text> : null}
      {item.tags.length ? <Text numberOfLines={2} style={[styles.tagsText, { color: theme.accent }]}>{item.tags.join(' · ')}</Text> : null}
    </View>
  </Pressable>;
}

function LibrarySongCover({ song, blurUrl }: { song?: LibrarySong; blurUrl: string | null }) {
  if (!song || isTufLevel(song)) {
    return <View style={styles.coverPlaceholder}><Text style={styles.coverNote}>♪</Text></View>;
  }
  if (blurUrl) {
    return <Image accessibilityLabel="曲绘" cachePolicy="disk" contentFit="cover" source={blurUrl} style={styles.cover} transition={120} />;
  }
  if (isChunithmSong(song)) {
    return (
      <Image
        accessibilityLabel="曲绘"
        cachePolicy="disk"
        contentFit="cover"
        source={chunithmJacketUrl(song)}
        style={styles.cover}
        transition={120}
      />
    );
  }
  return <SongCover songId={song.id} />;
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
  cover: { width: 58, height: 58, borderRadius: 9 },
  coverPlaceholder: { width: 58, height: 58, borderRadius: 9, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  coverNote: { color: '#6B7280', fontSize: 24 },
  title: { color: '#111827', fontWeight: '700' }, meta: { color: '#4B5563', fontSize: 11 }, tagsText: { color: '#246BFD', fontSize: 11 },
  warning: { color: '#B45309', fontSize: 11 }, empty: { color: '#6B7280', textAlign: 'center', marginTop: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, error: { color: '#B42318' }, link: { color: '#246BFD', fontWeight: '600' },
});
