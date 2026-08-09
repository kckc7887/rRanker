import { memo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameSongRow } from '@/components/game-content/GameSongRow';
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
  const [coverFailed, setCoverFailed] = useState(false);
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
      cover={(
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
      )}
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
