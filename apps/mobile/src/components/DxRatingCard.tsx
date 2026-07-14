import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { medalColor, resolveDxRatingTheme } from '@/domain/dx-rating-theme';

export function DxRatingCard({
  label,
  display,
  meta,
  rating,
}: {
  label: string;
  display: string;
  meta: string;
  /** 用于选档的数值；空账号传 null 用中性灰底 */
  rating: number | null;
}) {
  const theme = rating == null
    ? {
      id: 'empty',
      label: 'empty',
      colors: ['#2A3140', '#1A1F2A'] as const,
      labelColor: '#9CA3AF',
      valueColor: '#FFFFFF',
      metaColor: '#CBD5E1',
      medal: 'none' as const,
    }
    : resolveDxRatingTheme(rating);
  const accent = medalColor(theme.medal);

  return (
    <LinearGradient
      colors={[...theme.colors]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.card}
      accessibilityLabel={`${label} ${display}，档位 ${theme.label}`}
    >
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={[styles.cardLabel, { color: theme.labelColor }]}>{label}</Text>
          <Text style={[styles.rating, { color: theme.valueColor }]}>{display}</Text>
          <Text style={[styles.meta, { color: theme.metaColor }]}>{meta}</Text>
        </View>
        {accent ? <View style={[styles.medal, { backgroundColor: accent }]} /> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 6 },
  cardLabel: { fontSize: 12, fontWeight: '700' },
  rating: { fontSize: 42, fontWeight: '800', letterSpacing: 2 },
  meta: { fontSize: 14 },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
  },
});
