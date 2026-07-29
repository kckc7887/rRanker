import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GameManifestV1, SongDocument } from '@/domain/game-model';
import { GameAssetImage } from './GameAssetImage';
import { GameTag } from './GameTag';
import { useAppTheme } from '@/theme/app-theme';

export const GameSongCard = memo(function GameSongCard({
  manifest,
  song,
  favorite,
  favoritePending,
  onFavoriteChange,
}: {
  manifest: GameManifestV1;
  song: SongDocument;
  favorite: boolean;
  favoritePending: boolean;
  onFavoriteChange: (songId: string, favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看歌曲 ${song.title}`}
        onPress={() => router.push(`/songs/${encodeURIComponent(song.id)}` as Href)}
        style={styles.open}
      >
        <GameAssetImage asset={song.cover} accessibilityLabel={`歌曲封面 ${song.title}`} />
        <View style={styles.main}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>{song.title}</Text>
          <Text numberOfLines={1} style={[styles.artist, { color: theme.textMuted }]}>
            {song.artist}
          </Text>
          <View style={styles.chartGroups}>
            {song.chartGroups.map((group, groupIndex) => (
              <View key={groupIndex} style={styles.chartGroup}>
                {group.type ? <GameTag manifest={manifest} tag={group.type} small /> : null}
                {group.charts.map((chart) => (
                  <GameTag
                    key={chart.id}
                    manifest={manifest}
                    tag={chart.difficulty}
                    simplified
                    small
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={favorite ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
        disabled={favoritePending}
        onPress={() => onFavoriteChange(song.id, !favorite)}
        style={styles.favorite}
      >
        <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  main: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontWeight: '700' },
  artist: { fontSize: 11 },
  chartGroups: { gap: 4 },
  chartGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
