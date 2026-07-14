import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';

/** 切换列表用的 DX Rating 数字标签，配色与总览牌子主题一致。 */
export function DxRatingTag({
  rating,
  display,
}: {
  rating: number | null;
  display: string;
}) {
  const theme = rating == null
    ? {
      colors: ['#E5E7EB', '#D1D5DB'] as const,
      valueColor: '#6B7280',
      label: 'empty',
    }
    : resolveDxRatingTheme(rating);

  return (
    <LinearGradient
      colors={[...theme.colors]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.tag}
      accessibilityLabel={`DX Rating ${display}`}
    >
      <Text style={[styles.value, { color: theme.valueColor }]}>{display}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  value: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
});
