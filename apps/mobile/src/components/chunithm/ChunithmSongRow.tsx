import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  chunithmJacketId,
  type ChunithmDifficulty,
  type ChunithmLevelIndex,
  type ChunithmSong,
} from '@/domain/chunithm';
import { formatDifficultyConstant } from '@/components/ScoreVisuals';
import { useAppTheme } from '@/theme/app-theme';

export const CHUNITHM_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

const DIFFICULTY_THEME: Record<ChunithmLevelIndex, {
  background: string;
  text: string;
}> = {
  0: { background: '#3E9D6B', text: '#FFFFFF' },
  1: { background: '#E39124', text: '#FFFFFF' },
  2: { background: '#D84B68', text: '#FFFFFF' },
  3: { background: '#7137C8', text: '#FFFFFF' },
  4: { background: '#2D3037', text: '#FFFFFF' },
  5: { background: '#1767A6', text: '#FFFFFF' },
};

export function chunithmJacketUrl(song: ChunithmSong): string {
  return `${CHUNITHM_JACKET_ROOT}/${chunithmJacketId(song)}.png`;
}

function difficultyText(difficulty: ChunithmDifficulty): string {
  return formatDifficultyConstant(difficulty.levelValue);
}

function DifficultyChip({ difficulty }: { difficulty: ChunithmDifficulty }) {
  const colors = DIFFICULTY_THEME[difficulty.difficulty];
  const label = CHUNITHM_DIFFICULTY_LABELS[difficulty.difficulty];
  return (
    <View
      accessibilityLabel={`${label}，标级 ${difficulty.level}，定数 ${difficulty.levelValue.toFixed(1)}`}
      style={[styles.difficulty, { backgroundColor: colors.background }]}
    >
      <Text style={[styles.difficultyText, { color: colors.text }]}>
        {difficultyText(difficulty)}
      </Text>
    </View>
  );
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
            <DifficultyChip
              key={`${song.id}-${difficulty.difficulty}-${difficulty.originId ?? 'main'}`}
              difficulty={difficulty}
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
  difficulty: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  difficultyText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.25 },
});
