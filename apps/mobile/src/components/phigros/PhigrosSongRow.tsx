import { memo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { GameSongRow, WRAPPED_COVER_ROW_STYLES } from '@/components/game-content/GameSongRow';
import { PhigrosDifficultyBadge } from './PhigrosDifficultyBadge';
import type { Song } from '@/domain/models';
import { presentStandardSong } from '@/features/game-content/adapters';
import { useAppTheme } from '@/theme/app-theme';

export const PhigrosSongRow = memo(function PhigrosSongRow({
  song,
  blurUrl,
  favorite = false,
  favoritePending = false,
  onFavoriteChange,
  matchedAlias,
}: {
  song: Song;
  blurUrl: string | null;
  favorite?: boolean;
  favoritePending?: boolean;
  onFavoriteChange?: (songId: string, favorite: boolean) => void;
  matchedAlias?: string;
}) {
  const theme = useAppTheme();
  const presentation = presentStandardSong('phigros', song);

  return (
    <GameSongRow
      presentation={presentation}
      rowStyle={styles.row}
      openStyle={styles.openSong}
      mainStyle={styles.meta}
      titleStyle={styles.title}
      subtitleStyle={styles.composer}
      matchNote={matchedAlias ? `别名：${matchedAlias}` : undefined}
      matchNoteStyle={styles.composer}
      cover={null}
      coverImage={{
        source: blurUrl,
        accessibilityLabel: '曲绘',
        imageStyle: styles.cover,
        wrapStyle: styles.coverWrap,
        placeholderStyle: [styles.placeholder, { backgroundColor: theme.input }],
        noteStyle: styles.placeholderNote,
      }}
      badges={(
        <View style={styles.badges}>
            {[...(song.charts ?? [])]
              .sort((a, b) => a.levelIndex - b.levelIndex)
              .map((chart) => (
                <PhigrosDifficultyBadge
                  key={`${chart.songId}-${chart.levelIndex}`}
                  levelIndex={chart.levelIndex}
                  constant={chart.difficultyConstant}
                  showLabel={false}
                />
              ))}
        </View>
      )}
      accessory={onFavoriteChange ? (
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
    />
  );
});

export const PHIGROS_SONG_ROW_STYLES = StyleSheet.create({
  ...WRAPPED_COVER_ROW_STYLES,
  favorite: { paddingHorizontal: 4, paddingVertical: 8 },
});
const styles = PHIGROS_SONG_ROW_STYLES;
