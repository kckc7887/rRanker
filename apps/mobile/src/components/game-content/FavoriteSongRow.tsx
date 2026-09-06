import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { SongRowPresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';
import { GameSongRow } from './GameSongRow';
import { SIMAI_CATALOG_LIST_STYLES as styles } from './SimaiListStyles';

/** 舞萌曲库的封面、歌曲内容和右侧本地收藏按钮。 */
export function FavoriteSongRow({ presentation, cover, badges, subtitleContent, matchedAlias, favorite, favoritePending, onFavoriteChange }: {
  presentation: SongRowPresentation;
  cover: ReactNode;
  badges: ReactNode;
  subtitleContent: ReactNode;
  matchedAlias?: string;
  favorite: boolean;
  favoritePending: boolean;
  onFavoriteChange: (songId: string, favorite: boolean) => void;
}) {
  const theme = useAppTheme();
  return <GameSongRow presentation={presentation} accessibilityLabel={null}
    rowStyle={styles.row} openStyle={styles.openSong} mainStyle={styles.main}
    titleStyle={styles.title} subtitleStyle={styles.meta}
    matchNote={matchedAlias ? `别名：${matchedAlias}` : undefined} matchNoteStyle={styles.meta}
    subtitleContent={subtitleContent} cover={cover} badges={badges}
    accessory={<Pressable accessibilityRole="button"
      accessibilityLabel={favorite ? `取消收藏 ${presentation.title}` : `收藏 ${presentation.title}`}
      disabled={favoritePending} onPress={() => onFavoriteChange(presentation.route.songId, !favorite)} style={styles.favorite}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={theme.accent} size={24} />
    </Pressable>}
  />;
}
