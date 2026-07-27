import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import {
  type ChunithmSong,
} from '@/domain/chunithm';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';
import { useAppTheme } from '@/theme/app-theme';

export const CHUNITHM_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

export function chunithmJacketUrl(song: ChunithmSong): string {
  return `${CHUNITHM_JACKET_ROOT}/${song.id}.png`;
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
    <View
      testID={`chunithm-song-${song.id}`}
      style={[styles.row, { backgroundColor: theme.surface }]}
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
          {song.locked ? <Text style={styles.status}>需解锁</Text> : null}
          {song.disabled ? <Text style={styles.status}>已禁用</Text> : null}
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
            />
          ))}
        </View>
      </View>
    </View>
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
  status: {
    color: '#7C4A03',
    backgroundColor: '#FFF3CD',
    overflow: 'hidden',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 10,
    fontWeight: '700',
  },
  difficulties: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
