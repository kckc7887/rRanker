import { memo, useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { MuseDashDifficultyBadge } from './MuseDashDifficultyBadge';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import { museDashCoverUrl, type MuseDashSong } from '@/domain/muse-dash';
import { presentMuseDashSong } from '@/features/game-content/adapters';

export const MuseDashSongRow = memo(function MuseDashSongRow({
  song,
  albumTitle,
  constants,
}: {
  song: MuseDashSong;
  albumTitle: string;
  constants?: readonly (number | undefined)[];
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const presentation = presentMuseDashSong({ song, albumTitle }, constants);
  const coverUrl = museDashCoverUrl(song.cover);
  const slots = song.difficulty.flatMap((level, difficultyIndex) =>
    level === '0' ? [] : [{ difficultyIndex, level }]);
  return (
    <GameSongRow
      presentation={presentation}
      rowStyle={styles.row}
      pressedStyle={styles.pressed}
      wholeRowPressable
      mainStyle={styles.main}
      titleStyle={styles.title}
      subtitleStyle={styles.meta}
      cover={coverUrl && !coverFailed ? (
        <Image
          accessibilityLabel={`歌曲封面 ${song.name}`}
          cachePolicy="disk"
          contentFit="cover"
          onError={() => setCoverFailed(true)}
          source={coverUrl}
          style={styles.cover}
          transition={120}
        />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverNote}>♪</Text>
        </View>
      )}
      badges={(
        <View style={styles.difficulties}>
          {slots.map(({ difficultyIndex, level }) => (
            <MuseDashDifficultyBadge
              constant={constants?.[difficultyIndex]}
              key={`${song.uid}-${difficultyIndex}`}
              level={level}
              levelIndex={difficultyIndex}
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
  title: { flexShrink: 1, fontWeight: '700' },
  meta: { fontSize: 11 },
  pressed: { opacity: 0.72 },
  difficulties: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
});
