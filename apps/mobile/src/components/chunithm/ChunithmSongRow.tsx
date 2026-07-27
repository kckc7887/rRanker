import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type ChunithmSong,
} from '@/domain/chunithm';
import { formatChunithmWorldsEndLabel } from '@/domain/chunithm-score-presentation';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';
import { useAppTheme } from '@/theme/app-theme';

export const CHUNITHM_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

export function chunithmJacketUrl(song: ChunithmSong): string {
  const worldsEndOriginId = song.difficulties.find(
    (difficulty) => difficulty.difficulty === 5,
  )?.originId;
  return `${CHUNITHM_JACKET_ROOT}/${worldsEndOriginId ?? song.id}.png`;
}

export const ChunithmSongRow = memo(function ChunithmSongRow({
  song,
}: {
  song: ChunithmSong;
}) {
  const theme = useAppTheme();
  const [coverFailed, setCoverFailed] = useState(false);
  const difficulties = [...song.difficulties].sort(
    (left, right) => left.difficulty - right.difficulty,
  );

  return (
    <Pressable
      accessibilityLabel={`打开歌曲详情 ${song.title}`}
      accessibilityRole="button"
      onPress={() => router.push(`/songs/${encodeURIComponent(String(song.id))}` as Href)}
      testID={`chunithm-song-${song.id}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface },
        pressed && styles.pressed,
      ]}
    >
      {coverFailed ? (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverNote}>♪</Text>
        </View>
      ) : (
        <Image
          accessibilityLabel={`歌曲封面 ${song.title}`}
          cachePolicy="disk"
          contentFit="cover"
          onError={() => setCoverFailed(true)}
          source={chunithmJacketUrl(song)}
          style={styles.cover}
          transition={120}
        />
      )}
      <View style={styles.main}>
        <View style={styles.titleLine}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {song.title}
          </Text>
        </View>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>
          {song.artist ?? '艺术家未知'} · {song.versionTitle}
        </Text>
        <View style={styles.difficulties}>
          {difficulties.map((difficulty) => (
            <ChunithmDifficultyBadge
              constant={difficulty.levelValue}
              key={`${song.id}-${difficulty.difficulty}`}
              level={difficulty.level}
              levelIndex={difficulty.difficulty}
              worldsEndLabel={difficulty.difficulty === 5
                ? formatChunithmWorldsEndLabel({
                  kanji: difficulty.kanji,
                  star: difficulty.star,
                })
                : undefined}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  cover: {
    width: 62,
    height: 62,
    borderRadius: 9,
    backgroundColor: '#E5E7EB',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverNote: { color: '#6B7280', fontSize: 24 },
  main: { flex: 1, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { flexShrink: 1, fontWeight: '700' },
  meta: { fontSize: 11 },
  pressed: { opacity: 0.72 },
  difficulties: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
