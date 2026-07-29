import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveChunithmPossessionTheme } from '@/domain/chunithm-rating-theme';

/** 账号列表用的中二 Rating 数字标签，背景由 Rating 领域决定。 */
export function ChunithmRatingTag({
  display,
  ratingPossession,
}: {
  display: string;
  ratingPossession?: string | null;
}) {
  const rating = Number(display);
  if (!Number.isFinite(rating)) {
    return (
      <View accessibilityLabel="Rating —" style={[styles.tag, styles.empty]}>
        <Text style={[styles.value, styles.emptyValue]}>—</Text>
      </View>
    );
  }

  const value = rating.toFixed(2);
  const theme = resolveChunithmPossessionTheme(ratingPossession);
  return (
    <LinearGradient
      accessibilityLabel={`Rating ${value}，背景 ${theme.label}`}
      colors={[...theme.fillColors]}
      end={{ x: 1, y: 0.5 }}
      locations={[...theme.fillLocations]}
      start={{ x: 0, y: 0.5 }}
      style={styles.tag}
      testID="chunithm-rating-tag"
    >
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlayColor }]}
      />
      <Text style={[styles.value, { color: theme.textColor }]}>{value}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    minWidth: 70,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    overflow: 'hidden',
  },
  value: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
  empty: { backgroundColor: '#E5E7EB' },
  emptyValue: { color: '#6B7280' },
});
