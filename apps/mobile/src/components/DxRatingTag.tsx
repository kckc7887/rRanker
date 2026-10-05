import { StyleSheet, Text, View } from 'react-native';
import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';
import { TintedRatingTag } from '@/components/TintedRatingTag';

export function DxRatingTag({
  rating,
}: {
  rating: number | null;
  display: string;
}) {
  if (rating == null) {
    return <View accessibilityLabel="DX Rating —" style={styles.empty}><Text style={styles.emptyValue}>—</Text></View>;
  }
  const theme = resolveDxRatingTheme(rating);
  const value = String(Math.max(0, Math.floor(rating)));
  const stars = '★'.repeat(theme.starCount);

  return (
    <TintedRatingTag
      theme={theme}
      display={value}
      accessibilityLabel={`DX Rating ${value}${theme.starCount ? `，${theme.starCount} 星` : ''}`}
      tagStyle={styles.tag}
      valueStyle={styles.value}
      trailing={stars ? <Text testID="dx-rating-tag-stars" style={[styles.stars, { color: theme.starColor }]}>{stars}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  tag: { minHeight: 0, paddingHorizontal: 10, paddingVertical: 4 },
  value: { fontSize: 14, letterSpacing: 0.8 },
  stars: { fontSize: 10, fontWeight: '800', letterSpacing: -1 },
  empty: {
    alignSelf: 'flex-start',
    marginTop: 2,
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyValue: { color: '#6B7280', fontSize: 14, fontWeight: '800', letterSpacing: 0.8, fontVariant: ['tabular-nums'] },
});
