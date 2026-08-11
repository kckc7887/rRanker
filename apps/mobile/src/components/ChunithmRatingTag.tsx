import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  resolveChunithmPossessionTheme,
  resolveChunithmRatingTierBorder,
} from '@/domain/chunithm-rating-theme';

/** 账号列表用的中二 Rating 数字标签，背景由 Rating 领域决定、边框由 Rating 档位决定。 */
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
  const tierBorder = resolveChunithmRatingTierBorder(rating);
  return (
    <LinearGradient
      accessibilityLabel={`Rating ${value}，背景 ${theme.label}`}
      colors={[...tierBorder.borderColors]}
      end={{ x: 1, y: 0.5 }}
      locations={[...tierBorder.borderLocations]}
      start={{ x: 0, y: 0.5 }}
      style={styles.border}
      testID="chunithm-rating-tag-border"
    >
      <LinearGradient
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
  empty: {
    alignSelf: 'flex-start',
    minWidth: 70,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
  },
  emptyValue: { color: '#6B7280' },
});
