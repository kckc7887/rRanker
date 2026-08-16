import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  type ChunithmDifficulty,
  type ChunithmSong,
} from '@/domain/chunithm';
import { formatChunithmWorldsEndLabel } from '@/domain/chunithm-score-presentation';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import { presentChunithmSong } from '@/features/game-content/adapters';
import { ChunithmDifficultyBadge } from './ChunithmDifficultyBadge';

export const CHUNITHM_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

export function chunithmJacketUrl(song: ChunithmSong): string {
  const worldsEndOriginId = song.difficulties.find(
    (difficulty) => difficulty.difficulty === 5,
  )?.originId;
  return `${CHUNITHM_JACKET_ROOT}/${worldsEndOriginId ?? song.id}.png`;
}

export const ChunithmSongRow = memo(function ChunithmSongRow({
  song,
  displayedDifficulties,
  displayedVersionTitle,
  matchedAlias,
}: {
  song: ChunithmSong;
  displayedDifficulties?: readonly ChunithmDifficulty[];
  displayedVersionTitle?: string;
  matchedAlias?: string;
}) {
  const presentation = presentChunithmSong(song);
  const difficulties = [...(displayedDifficulties ?? song.difficulties)].sort(
    (left, right) => left.difficulty - right.difficulty,
  );

  return (
    <GameSongRow
      presentation={presentation}
      testID={`chunithm-song-${song.id}`}
      rowStyle={styles.row}
      pressedStyle={styles.pressed}
      wholeRowPressable
      mainStyle={styles.main}
      titleWrapperStyle={styles.titleLine}
      titleStyle={styles.title}
      subtitleStyle={styles.meta}
      matchNote={matchedAlias ? `别名：${matchedAlias}` : undefined}
      matchNoteStyle={styles.meta}
      subtitleContent={<>{song.artist ?? '艺术家未知'} · {displayedVersionTitle ?? song.versionTitle}</>}
      cover={null}
      coverImage={{
        source: chunithmJacketUrl(song),
        accessibilityLabel: `歌曲封面 ${song.title}`,
        imageStyle: styles.cover,
        placeholderStyle: [styles.cover, styles.coverPlaceholder],
        noteStyle: styles.coverNote,
      }}
      badges={(
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
      )}
    />
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
