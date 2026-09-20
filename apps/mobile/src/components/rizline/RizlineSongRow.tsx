import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GameSongRow, WRAPPED_COVER_ROW_STYLES as styles } from '@/components/game-content/GameSongRow';
import { rizlineCoverUrl, sortedRizlineCharts, type RizlineSong } from '@/domain/rizline';
import { presentRizlineSong } from '@/features/game-content/adapters/rizline';
import { useAppTheme } from '@/theme/app-theme';
import { RizlineDifficultyBadge } from './RizlineScoreVisuals';

export const RizlineSongRow = memo(function RizlineSongRow({ song, favorite = false, favoritePending = false, onFavoriteChange }: {
  song: RizlineSong; favorite?: boolean; favoritePending?: boolean; onFavoriteChange?: (songId: string, favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentRizlineSong(song)} cover={null} rowStyle={styles.row} openStyle={styles.openSong}
    mainStyle={styles.meta} titleStyle={styles.title} subtitleStyle={styles.composer}
    coverImage={{ source: rizlineCoverUrl(song), accessibilityLabel: '曲绘', imageStyle: styles.cover, wrapStyle: styles.coverWrap,
      placeholderStyle: [styles.placeholder, { backgroundColor: theme.input }], noteStyle: styles.placeholderNote }}
    badges={<View style={styles.badges}>{sortedRizlineCharts(song.charts).map((chart) =>
      <RizlineDifficultyBadge key={chart.id} difficulty={chart.difficulty} constant={chart.constant} showLabel={false} />)}</View>}
    accessory={onFavoriteChange ? <Pressable accessibilityRole="button" accessibilityLabel={`${favorite ? '取消收藏' : '收藏'} ${song.title}`}
      disabled={favoritePending} onPress={() => onFavoriteChange(song.id, !favorite)} style={localStyles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
    </Pressable> : null} />;
});

const localStyles = StyleSheet.create({ favorite: { paddingHorizontal: 4, paddingVertical: 8 } });
