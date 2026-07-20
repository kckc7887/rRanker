import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { Song } from '@/domain/models';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosSongRow = memo(function PhigrosSongRow({
  song,
  blurUrl,
}: {
  song: Song;
  blurUrl: string | null;
}) {
  const theme = useAppTheme();
  const [coverFailed, setCoverFailed] = useState(false);
  const openDetail = () => router.push(`/songs/${encodeURIComponent(song.id)}` as Href);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`查看歌曲 ${song.title}`}
      onPress={openDetail}
      style={[styles.row, { backgroundColor: theme.surface }]}
    >
      <View style={styles.main}>
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
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  coverWrap: { width: 58, height: 58 },
  cover: { width: 58, height: 58, borderRadius: 9 },
  placeholder: { width: 58, height: 58, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  placeholderNote: { color: '#6B7280', fontSize: 24 },
  meta: { flex: 1, gap: 3 },
  title: { fontWeight: '700' },
  composer: { fontSize: 11 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
});
