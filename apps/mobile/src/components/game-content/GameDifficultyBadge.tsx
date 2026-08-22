/**
 * 公共难度胶囊骨架：
 * - 容器：32×24 圆角胶囊（minWidth 32 / height 24 / borderRadius 999 / paddingHorizontal 8）；
 * - 主题插槽：各游戏自留颜色表，仅以 { background, border, text } 三元组注入，公共层不枚举游戏；
 * - 特殊难度插槽：提供 special 即渲染 LinearGradient 胶囊 + 遮罩，渐变色组由游戏侧传入；
 * - 尺寸档插槽：默认胶囊之外的尺寸（maimai compact/mini）通过 badgeVariants/textVariants 整体替换，
 *   数组结构（含 false 占位）原样进入宿主树，不得在此重排；
 * - style 为末位追加槽：传 null 可保留占位（TUF 外部 style 语义），未传时不占位。
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

export interface GameDifficultyBadgeTheme {
  background: string;
  border: string;
  text: string;
}

export interface GameDifficultyBadgeSpecial {
  /** 特殊难度渐变色组（如 SPECIAL_DIFFICULTY_GRADIENT） */
  gradient: readonly [string, string, ...string[]];
  /** 特殊难度文字色；未提供时使用基础文本颜色。 */
  textColor?: string;
}

type GameDifficultyBadgeProps = {
  /** 胶囊文本（display 语义由各游戏包装层计算） */
  text: string;
  theme: GameDifficultyBadgeTheme;
  accessibilityLabel?: string;
  /** 覆盖默认胶囊的容器样式组（首项用于特殊难度分支），maimai 尺寸档语义 */
  badgeVariants?: StyleProp<ViewStyle>[];
  /** 默认胶囊裁剪内容（TUF 特殊难度渐变需要 overflow hidden） */
  clipped?: boolean;
  /** 烘进默认基础文本样式的兜底色（TUF 特殊难度白字语义） */
  fallbackTextColor?: string;
  /** 提供即渲染特殊难度渐变胶囊 */
  special?: GameDifficultyBadgeSpecial;
  /** 末位追加样式；传 null 可保留占位（TUF 外部 style 语义） */
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** 覆盖默认文本样式组（首项为基础样式），maimai 尺寸档语义 */
  textVariants?: StyleProp<TextStyle>[];
};

export function GameDifficultyBadge({
  text,
  theme,
  accessibilityLabel,
  badgeVariants,
  clipped = false,
  fallbackTextColor,
  special,
  style,
  testID,
  textVariants,
}: GameDifficultyBadgeProps) {
  const badges = badgeVariants ?? [clipped ? styles.badgeClipped : styles.badge];
  const textBase = fallbackTextColor == null
    ? styles.text
    : { ...styles.text, color: fallbackTextColor };
  const textStyles = textVariants ?? [textBase];

  if (special) {
    return (
      <LinearGradient
        accessibilityLabel={accessibilityLabel}
        colors={special.gradient}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={style === undefined ? badges[0] : [badges[0], style]}
        testID={testID}
      >
        <View pointerEvents="none" style={styles.specialOverlay} />
        <Text numberOfLines={1} style={special.textColor == null
          ? textStyles[0]
          : [textStyles[0], { color: special.textColor }]}>
          {text}
        </Text>
      </LinearGradient>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={style === undefined
        ? [...badges, { backgroundColor: theme.background, borderColor: theme.border }]
        : [...badges, { backgroundColor: theme.background, borderColor: theme.border }, style]}
      testID={testID}
    >
      <Text numberOfLines={1} style={[...textStyles, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const pill = {
  minWidth: 32,
  height: 24,
  borderWidth: 1,
  borderRadius: 999,
  paddingHorizontal: 8,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const styles = StyleSheet.create({
  badge: pill,
  badgeClipped: { ...pill, overflow: 'hidden' as const },
  specialOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,14,38,0.24)' },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 0.25 },
});
