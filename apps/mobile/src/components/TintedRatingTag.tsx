import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { DxRatingTheme } from '@/domain/dx-rating-theme';

/** 账号列表用的主题化 Rating 数字标签：骨架与字号由公共样式提供，游戏差异经主题、可选样式覆盖与尾随插槽表达。 */
export function TintedRatingTag({
  theme,
  display,
  accessibilityLabel,
  testID,
  fillTestID,
  borderStyle,
  tagStyle,
  valueStyle,
  trailing,
}: {
  theme: DxRatingTheme;
  display: string;
  accessibilityLabel: string;
  testID?: string;
  /** 内层填充渐变的 testID；缺省沿用 `${testID}-fill`。 */
  fillTestID?: string;
  /** 追加在公共边框样式之后的覆盖项。 */
  borderStyle?: StyleProp<ViewStyle>;
  /** 追加在公共标签样式之后的覆盖项。 */
  tagStyle?: StyleProp<ViewStyle>;
  /** 追加在公共数值文本样式之后的覆盖项。 */
  valueStyle?: StyleProp<TextStyle>;
  /** 渲染在标签右侧的尾随元素（如档位星标）；提供后根节点改为水平排列容器并承载无障碍标签。 */
  trailing?: ReactNode;
}) {
  const gradient = (
    <LinearGradient
      accessibilityLabel={trailing ? undefined : accessibilityLabel}
      colors={[...theme.borderColors]}
      end={{ x: 1, y: 0.5 }}
      locations={[...theme.borderLocations]}
      start={{ x: 0, y: 0.5 }}
      style={[styles.border, trailing ? styles.borderInline : null, borderStyle]}
      testID={testID}
    >
      <LinearGradient
        colors={[...theme.fillColors]}
        end={{ x: 1, y: 0.5 }}
        locations={[...theme.fillLocations]}
        start={{ x: 0, y: 0.5 }}
        style={[styles.tag, tagStyle]}
        testID={fillTestID ?? (testID ? `${testID}-fill` : undefined)}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlayColor }]}
        />
        <Text style={[styles.value, { color: theme.textColor }, valueStyle]}>{display}</Text>
      </LinearGradient>
    </LinearGradient>
  );
  if (!trailing) return gradient;
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.wrap}>
      {gradient}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  border: {
    alignSelf: 'flex-start',
    minWidth: 74,
    marginTop: 2,
    borderRadius: 10,
    padding: 2,
    alignItems: 'center',
  },
  /** 尾随元素模式下，定位职责移交外层容器，边框回归纯包裹样式。 */
  borderInline: {
    alignSelf: 'auto',
    minWidth: 0,
    marginTop: 0,
  },
  wrap: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  tag: {
    minWidth: 70,
    minHeight: 28,
    borderRadius: 8,
    paddingHorizontal: 9,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  value: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
});
