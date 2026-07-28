import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
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
  valueTheme,
  sideBadge,
  borderless = false,
}: {
  label: string;
  display: string;
  meta: string;
  /** 用于选档的数值；空账号传 null 用中性灰底 */
  rating: number | null;
  /** 自定义主题（如 Phigros 课题模式） */
  themeOverride?: DxRatingTheme;
  /** 仅覆盖 Rating 数字的颜色；多色时渲染为横向渐变。 */
  valueTheme?: {
    label: string;
    colors: readonly [string, ...string[]];
    shadowColor?: string;
  };
  sideBadge?: {
    title: string;
    value: string;
  };
  /** 移除外层渐变边框，并补偿内边距以保持卡片尺寸与内容位置。 */
  borderless?: boolean;
}) {
  const theme = themeOverride ?? (rating == null ? EMPTY_THEME : resolveDxRatingTheme(rating));
  const stars = '★'.repeat(theme.starCount);
  const valueLabel = valueTheme?.label ?? theme.label;
  const accessibilityLabel = valueTheme
    ? `${label} ${display}，档位 ${valueLabel}，背景 ${theme.label}`
    : `${label} ${display}，档位 ${theme.label}${theme.starCount ? `，${theme.starCount} 星` : ''}`;

  return (
    <LinearGradient
      colors={[...(borderless ? theme.fillColors : theme.borderColors)]}
      locations={[...(borderless ? theme.fillLocations : theme.borderLocations)]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[styles.card, borderless && styles.cardBorderless]}
      accessibilityLabel={accessibilityLabel}
      testID={borderless ? 'dx-rating-card-borderless' : 'dx-rating-card'}
    >
      <LinearGradient
        colors={[...theme.fillColors]}
        locations={[...theme.fillLocations]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.inner, borderless && styles.innerBorderless]}
        testID={borderless ? 'dx-rating-card-inner-borderless' : 'dx-rating-card-inner'}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlayColor }]} />
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={[styles.cardLabel, { color: theme.textColor }]}>{label}</Text>
            <RatingValue display={display} fallbackColor={theme.textColor} valueTheme={valueTheme} />
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

function RatingValue({
  display,
  fallbackColor,
  valueTheme,
}: {
  display: string;
  fallbackColor: string;
  valueTheme?: {
    label: string;
    colors: readonly [string, ...string[]];
    shadowColor?: string;
  };
}) {
  const shadowStyle = valueTheme ? {
    textShadowColor: valueTheme.shadowColor ?? 'rgba(2,6,18,0.96)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 5,
  } as const : null;
  const colors = valueTheme?.colors;
  if (!colors || colors.length < 2) {
    return (
      <Text
        testID="dx-rating-card-value"
        style={[styles.rating, { color: colors?.[0] ?? fallbackColor }, shadowStyle]}
      >
        {display}
      </Text>
    );
  }

  return (
    <View style={styles.gradientValueWrap}>
      <Text
        pointerEvents="none"
        style={[styles.rating, styles.gradientValueShadow, shadowStyle]}
      >
        {display}
      </Text>
      <MaskedView
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID="dx-rating-card-value-gradient"
        maskElement={<Text style={[styles.rating, styles.gradientValueMask]}>{display}</Text>}
      >
        <LinearGradient
          colors={colors as readonly [string, string, ...string[]]}
          end={{ x: 1, y: 0.5 }}
          start={{ x: 0, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 3 },
  cardBorderless: { padding: 0 },
  inner: { borderRadius: 15, padding: 19, overflow: 'hidden' },
  innerBorderless: { borderRadius: 18, padding: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 6 },
  cardLabel: { fontSize: 12, fontWeight: '700' },
  rating: { fontSize: 42, fontWeight: '800', letterSpacing: 2 },
  gradientValueWrap: { height: 51, alignSelf: 'stretch' },
  gradientValueShadow: { color: '#020612' },
  gradientValueMask: { color: '#000000' },
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
