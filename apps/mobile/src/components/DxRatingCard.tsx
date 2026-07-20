import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveDxRatingTheme, type DxRatingTheme } from '@/domain/dx-rating-theme';

const EMPTY_THEME: DxRatingTheme = {
  id: 'empty', label: 'empty',
  fillColors: ['#2A3140', '#1A1F2A'], fillLocations: [0, 1],
  borderColors: ['#596273', '#303745'], borderLocations: [0, 1],
  overlayColor: 'transparent', textColor: '#FFFFFF', starColor: '#CBD5E1', starCount: 0,
};

export function DxRatingCard({
  label,
  display,
  meta,
  rating,
  themeOverride,
  sideBadge,
}: {
  label: string;
  display: string;
  meta: string;
  /** 用于选档的数值；空账号传 null 用中性灰底 */
  rating: number | null;
  /** 自定义主题（如 Phigros 课题模式） */
  themeOverride?: DxRatingTheme;
  sideBadge?: {
    title: string;
    value: string;
  };
}) {
  const theme = themeOverride ?? (rating == null ? EMPTY_THEME : resolveDxRatingTheme(rating));
  const stars = '★'.repeat(theme.starCount);

  return (
    <LinearGradient
      colors={[...theme.borderColors]}
      locations={[...theme.borderLocations]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.card}
      accessibilityLabel={`${label} ${display}，档位 ${theme.label}${theme.starCount ? `，${theme.starCount} 星` : ''}`}
    >
      <LinearGradient
        colors={[...theme.fillColors]}
        locations={[...theme.fillLocations]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.inner}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlayColor }]} />
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={[styles.cardLabel, { color: theme.textColor }]}>{label}</Text>
            <Text style={[styles.rating, { color: theme.textColor }]}>{display}</Text>
            <Text style={[styles.meta, { color: theme.textColor }]}>{meta}</Text>
          </View>
          {sideBadge ? (
            <View style={styles.badgeWrap}>
              <Text style={[styles.badgeTitle, { color: theme.textColor }]}>{sideBadge.title}</Text>
              <View style={styles.badge}>
                <Text style={[styles.badgeValue, { color: theme.textColor }]}>{sideBadge.value}</Text>
              </View>
            </View>
          ) : stars ? <Text testID="dx-rating-card-stars" style={[styles.stars, { color: theme.starColor }]}>{stars}</Text> : null}
        </View>
      </LinearGradient>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 3 },
  inner: { borderRadius: 15, padding: 19, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 6 },
  cardLabel: { fontSize: 12, fontWeight: '700' },
  rating: { fontSize: 42, fontWeight: '800', letterSpacing: 2 },
  meta: { fontSize: 14, opacity: 0.78 },
  stars: { maxWidth: 96, fontSize: 20, lineHeight: 28, fontWeight: '800', letterSpacing: 2, textAlign: 'right' },
  badgeWrap: { alignItems: 'flex-end', alignSelf: 'flex-start', gap: 6 },
  badgeTitle: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  badge: {
    minWidth: 88,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
  },
  badgeValue: { fontSize: 26, fontWeight: '800', letterSpacing: 1 },
});
