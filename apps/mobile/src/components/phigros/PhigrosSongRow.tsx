import { memo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { Song } from '@/domain/models';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosSongRow = memo(function PhigrosSongRow({
  song,
  blurUrl,
  favorite = false,
  favoritePending = false,
  onFavoriteChange,
}: {
  song: Song;
  blurUrl: string | null;
  favorite?: boolean;
  favoritePending?: boolean;
  onFavoriteChange?: (songId: string, favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  const [coverFailed, setCoverFailed] = useState(false);
  const openDetail = () => router.push(`/songs/${encodeURIComponent(song.id)}` as Href);

  return (
    <View style={[styles.row, { backgroundColor: theme.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看歌曲 ${song.title}`}
        onPress={openDetail}
        style={styles.openSong}
      >
        <View style={styles.coverWrap}>
          {coverFailed || !blurUrl ? (
            <View style={[styles.placeholder, { backgroundColor: theme.input }]}>
              <Text style={styles.placeholderNote}>♪</Text>
            </View>
          ) : (
            <Image
              accessibilityLabel="曲绘"
              cachePolicy="disk"
              contentFit="cover"
              onError={() => setCoverFailed(true)}
              source={blurUrl}
              style={styles.cover}
              transition={120}
            />
          )}
        </View>
        <View style={styles.meta}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{song.title}</Text>
          <Text numberOfLines={1} style={[styles.composer, { color: theme.textMuted }]}>
            {song.artist ?? '曲师未知'}
          </Text>
          <View style={styles.badges}>
            {[...(song.charts ?? [])]
              .sort((a, b) => a.levelIndex - b.levelIndex)
              .map((chart) => (
                <PhigrosDifficultyBadge
                  key={`${chart.songId}-${chart.levelIndex}`}
                  levelIndex={chart.levelIndex}
                  constant={chart.difficultyConstant}
                />
              ))}
          </View>
        </View>
      </Pressable>
      {onFavoriteChange ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
          disabled={favoritePending}
          onPress={() => onFavoriteChange(song.id, !favorite)}
          style={styles.favorite}
        >
          <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  openSong: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  coverWrap: { width: 58, height: 58 },
  cover: { width: 58, height: 58, borderRadius: 9 },
  placeholder: { width: 58, height: 58, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  placeholderNote: { color: '#6B7280', fontSize: 24 },
  meta: { flex: 1, gap: 3 },
  title: { fontWeight: '700' },
  composer: { fontSize: 11 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  favorite: { paddingHorizontal: 4, paddingVertical: 8 },
});
