import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ChunithmSong } from '@/domain/chunithm';
import { useAppTheme } from '@/theme/app-theme';
import { BestImagePickerShell } from '@/features/best-image/best-image-picker-shell';
import { RemoteNativeImage as Image } from '@/components/RemoteNativeImage';
import { filterChunithmBestImageBackgroundSongs } from './chunithm-best-image-background';
import type { ChunithmBestImageBackgroundChoice } from './chunithm-best-image-preferences';
import { chunithmBestImageJacketUrl } from './load-chunithm-best-image-jackets';

export function ChunithmBestImageBackgroundPicker({
  visible,
  songs,
  selection,
  onClose,
  onSelect,
}: {
  visible: boolean;
  songs: readonly ChunithmSong[];
  selection: ChunithmBestImageBackgroundChoice;
  onClose: () => void;
  onSelect: (choice: ChunithmBestImageBackgroundChoice) => void;
}) {
  const theme = useAppTheme();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filteredSongs = useMemo(() => {
    return filterChunithmBestImageBackgroundSongs(songs, query);
  }, [query, songs]);

  return (
    <BestImagePickerShell
      visible={visible}
      onClose={onClose}
      title="选择歌曲背景"
      countText={[filteredSongs.length, ' 首歌曲']}
      closeLabel="关闭背景选择"
      searchLabel="搜索背景歌曲"
      searchPlaceholder="搜索标题、艺术家或歌曲 ID"
      query={query}
      onQueryChange={setQuery}
      aboveList={(
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: selection.mode === 'default' }}
          accessibilityLabel="使用默认背景"
          onPress={() => onSelect({ mode: 'default' })}
          style={[
            styles.defaultItem,
            { backgroundColor: theme.surface, borderColor: theme.border },
            selection.mode === 'default' && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}
        >
          <View style={[styles.defaultPreview, { backgroundColor: theme.surfaceMuted }]}>
            <View style={[styles.defaultGlow, { backgroundColor: theme.accentSoft }]} />
          </View>
          <View style={styles.copy}>
            <Text style={[styles.itemName, { color: theme.text }]}>默认背景</Text>
            <Text style={[styles.itemMeta, { color: theme.textMuted }]}>浅色渐变</Text>
          </View>
        </Pressable>
      )}
      data={filteredSongs}
      keyExtractor={(song) => String(song.id)}
      flatListProps={{
        renderItem: ({ item }) => {
          const selected = selection.mode === 'song' && selection.songId === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`使用${item.title}作为背景`}
              onPress={() => onSelect({ mode: 'song', songId: item.id })}
              style={[
                styles.item,
                { backgroundColor: theme.surface, borderColor: theme.border },
                selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
              ]}
            >
              <View style={[styles.preview, { backgroundColor: theme.surfaceMuted }]}>
                <Image
                  cacheProfile="none"
                  source={{ uri: chunithmBestImageJacketUrl(String(item.id)) }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.itemName, { color: theme.text }]}>{item.title}</Text>
                <Text numberOfLines={1} style={[styles.itemMeta, { color: theme.textMuted }]}>
                  {item.artist?.trim() || '未知艺术家'} · ID{item.id}
                </Text>
              </View>
            </Pressable>
          );
        },
      }}
      styles={{
        root: styles.root,
        grabber: styles.grabber,
        header: styles.header,
        title: styles.title,
        count: styles.count,
        done: styles.close,
        search: styles.search,
        listContent: styles.list,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  count: { marginTop: 2, fontSize: 12, fontWeight: '600' },
  close: { fontSize: 15, fontWeight: '700' },
  search: { marginHorizontal: 16, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, fontSize: 14 },
  defaultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 14 },
  defaultPreview: { width: 54, height: 54, overflow: 'hidden', borderRadius: 10 },
  defaultGlow: { position: 'absolute', width: 64, height: 64, borderRadius: 32, right: -18, bottom: -22 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 14 },
  preview: { width: 54, height: 54, overflow: 'hidden', borderRadius: 10 },
  previewImage: { width: '100%', height: '100%' },
  copy: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '700' },
  itemMeta: { marginTop: 3, fontSize: 12 },
});
