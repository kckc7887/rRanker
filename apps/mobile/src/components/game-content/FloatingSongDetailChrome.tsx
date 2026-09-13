import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SongDetailChrome } from './SongDetailChrome';
import { SONG_DETAIL_CHROME_STYLES } from './SongDetailChromeStyles';

export function FloatingSongDetailChrome({
  songTitle,
  favorite,
  favoriteDisabled,
  onToggleFavorite,
}: {
  songTitle?: string;
  favorite: boolean;
  favoriteDisabled: boolean;
  onToggleFavorite?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <SongDetailChrome
      topInset={insets.top}
      backStyle={(pressed) => [
        SONG_DETAIL_CHROME_STYLES.headerButton,
        SONG_DETAIL_CHROME_STYLES.headerFloatingButton,
        { top: insets.top, left: 8 },
        pressed && { opacity: 0.7 },
      ]}
      favorite={songTitle && onToggleFavorite ? {
        label: favorite ? `取消收藏 ${songTitle}` : `收藏 ${songTitle}`,
        active: favorite,
        disabled: favoriteDisabled,
        onPress: onToggleFavorite,
      } : undefined}
      favoriteStyle={(pressed) => [
        SONG_DETAIL_CHROME_STYLES.headerButton,
        SONG_DETAIL_CHROME_STYLES.headerFloatingButton,
        { top: insets.top, right: 8 },
        favorite && SONG_DETAIL_CHROME_STYLES.headerFavoriteActive,
        pressed && { opacity: 0.7 },
      ]}
    />
  );
}
