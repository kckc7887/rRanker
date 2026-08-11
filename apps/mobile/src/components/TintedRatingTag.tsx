import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { DxRatingTheme } from '@/domain/dx-rating-theme';

/** 账号列表用的固定主题 Rating 数字标签，背景与边框由传入主题决定（adofai TUF / 喵斯）。 */
export function TintedRatingTag({
  theme,
  display,
  accessibilityLabel,
  testID,
}: {
  theme: DxRatingTheme;
  display: string;
  accessibilityLabel: string;
  testID?: string;
}) {
  return (
    <LinearGradient
      accessibilityLabel={accessibilityLabel}
      colors={[...theme.borderColors]}
      end={{ x: 1, y: 0.5 }}
      locations={[...theme.borderLocations]}
      start={{ x: 0, y: 0.5 }}
      style={styles.border}
      testID={testID}
    >
      <LinearGradient
        colors={[...theme.fillColors]}
        end={{ x: 1, y: 0.5 }}
        locations={[...theme.fillLocations]}
        start={{ x: 0, y: 0.5 }}
        style={styles.tag}
        testID={testID ? `${testID}-fill` : undefined}
      >
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlayColor }]}
        />
        <Text style={[styles.value, { color: theme.textColor }]}>{display}</Text>
      </LinearGradient>
    </LinearGradient>
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
