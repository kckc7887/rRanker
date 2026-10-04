import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useSongDetailBackNavigation } from './SongDetailNavigation';

export type SongDetailFavoriteOptions = {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
};

export function SongDetailChrome({
  topInset,
  backStyle,
  favorite,
  favoriteStyle,
}: {
  topInset: number;
  backStyle: (pressed: boolean) => StyleProp<ViewStyle>[];
  favorite?: SongDetailFavoriteOptions;
  favoriteStyle?: (pressed: boolean) => StyleProp<ViewStyle>[];
}) {
  const navigateBack = useSongDetailBackNavigation();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        hitSlop={12}
        onPress={navigateBack}
        style={({ pressed }) => backStyle(pressed)}
      >
        <Ionicons
          name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
          color="#FFFFFF"
          size={28}
        />
      </Pressable>
      {favorite && favoriteStyle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={favorite.label}
          disabled={favorite.disabled}
          hitSlop={12}
          onPress={favorite.onPress}
          style={({ pressed }) => favoriteStyle(pressed)}
        >
          <Ionicons
            name={favorite.active ? 'heart' : 'heart-outline'}
            color={favorite.active ? '#A78BFA' : '#FFFFFF'}
            size={22}
          />
        </Pressable>
      ) : null}
    </>
  );
}
