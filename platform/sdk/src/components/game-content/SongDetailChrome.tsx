import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSongDetailBackNavigation } from '@rranker/sdk/components/game-content/SongDetailNavigation';
import { SONG_DETAIL_CHROME_STYLES as styles } from '@rranker/sdk/components/game-content/SongDetailChromeStyles';

export function SongDetailChrome({ songTitle, favorite, favoriteDisabled, onToggleFavorite, topOffset = 0 }: {
  songTitle?: string;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite?: () => void;
  topOffset?: number;
}) {
  const top = useSafeAreaInsets().top + topOffset;
  const navigateBack = useSongDetailBackNavigation();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={12} onPress={navigateBack}
      style={({ pressed }) => [styles.headerButton, styles.headerFloatingButton, { top, left: 8 }, pressed && { opacity: 0.7 }]}>
      <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} color="#FFFFFF" size={28} />
    </Pressable>
    {songTitle && onToggleFavorite ? <Pressable accessibilityRole="button" hitSlop={12} disabled={favoriteDisabled}
      accessibilityLabel={favorite ? `取消收藏 ${songTitle}` : `收藏 ${songTitle}`} onPress={onToggleFavorite}
      style={({ pressed }) => [styles.headerButton, styles.headerFloatingButton, { top, right: 8 },
        pressed && { opacity: 0.7 }, favoriteDisabled && { opacity: 0.52 }]}>
      <Ionicons name={favorite ? 'heart' : 'heart-outline'} color={favorite ? '#A78BFA' : '#FFFFFF'} size={22} />
    </Pressable> : null}
  </>;
}
