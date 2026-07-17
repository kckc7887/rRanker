import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';

/** 切换列表用的 DX Rating 数字标签，配色与总览牌子主题一致。 */
export function DxRatingTag({
  rating,
}: {
  rating: number | null;
  display: string;
}) {
  if (rating == null) {
    return <View accessibilityLabel="DX Rating —" style={[styles.tag, styles.empty]}><Text style={[styles.value, styles.emptyValue]}>—</Text></View>;
  }
  const theme = resolveDxRatingTheme(rating);
  const value = String(Math.max(0, Math.floor(rating)));
  const stars = '★'.repeat(theme.starCount);

  return (
    <View style={styles.wrap} accessibilityLabel={`DX Rating ${value}${theme.starCount ? `，${theme.starCount} 星` : ''}`}>
      <LinearGradient colors={[...theme.borderColors]} locations={[...theme.borderLocations]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.border}>
        <LinearGradient colors={[...theme.fillColors]} locations={[...theme.fillLocations]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.tag}>
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlayColor }]} />
          <Text style={[styles.value, { color: theme.textColor }]}>{value}</Text>
        </LinearGradient>
      </LinearGradient>
      {stars ? <Text testID="dx-rating-tag-stars" style={[styles.stars, { color: theme.starColor }]}>{stars}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  border: { borderRadius: 10, padding: 2 },
  tag: {
    borderRadius: 8,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    overflow: 'hidden',
  },
  value: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  stars: { fontSize: 10, fontWeight: '800', letterSpacing: -1 },
  empty: { alignSelf: 'flex-start', marginTop: 2, minWidth: 70, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#E5E7EB', alignItems: 'center' },
  emptyValue: { color: '#6B7280' },
});
