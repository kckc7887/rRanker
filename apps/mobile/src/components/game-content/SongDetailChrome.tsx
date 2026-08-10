import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useSongDetailBackNavigation } from './SongDetailNavigation';

export type SongDetailFavoriteOptions = {
  /** 无障碍标签文案，由调用方拼好（如 `取消收藏 xxx`） */
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
};

/**
 * 歌曲详情页悬浮按钮壳：返回按钮 + 可选收藏按钮。
 * 各游戏视觉差异（尺寸、底色、层级、按压态、激活态、禁用态）通过样式插槽原样提供，
 * 组件只负责结构、位置、图标与无障碍属性，不统一任何主题值。
 */
export function SongDetailChrome({
  topInset,
  backStyle,
  favorite,
  favoriteStyle,
}: {
  /** 顶部偏移：调用方传 insets.top（可加额外偏移） */
  topInset: number;
  /** 返回按钮完整样式数组（含位置 top/left 与按压态），按 pressed 状态生成 */
  backStyle: (pressed: boolean) => StyleProp<ViewStyle>[];
  /** 收藏按钮配置；不传则不渲染收藏按钮 */
  favorite?: SongDetailFavoriteOptions;
  /** 收藏按钮完整样式数组（含位置 top/right 与按压态）；与 favorite 同时存在时渲染 */
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
