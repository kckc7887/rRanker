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
  /** 使用档位色描边 Rating 数字；多色时描边渲染为横向渐变。 */
  valueTheme?: {
    label: string;
    colors: readonly [string, ...string[]];
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
  };
}) {
  const colors = valueTheme?.colors;
  if (!colors) {
    return (
      <Text
        testID="dx-rating-card-value"
        style={[styles.rating, { color: fallbackColor }]}
      >
        {display}
      </Text>
    );
  }

  return (
    <View style={styles.outlinedValueWrap}>
      {colors.length >= 2 ? (
        <MaskedView
          // Android 硬件模式可能缓存首次文字布局前的空遮罩，software 模式可随布局完成立即更新。
          androidRenderingMode="software"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          testID="dx-rating-card-value-gradient"
          maskElement={<RatingOutlineMask display={display} />}
        >
          <LinearGradient
            colors={colors as readonly [string, string, ...string[]]}
            end={{ x: 1, y: 0.5 }}
            start={{ x: 0, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      ) : (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          testID="dx-rating-card-value-outline-solid"
        >
          {RATING_OUTLINE_OFFSETS.map(({ x, y }) => (
            <Text
              key={`${x}:${y}`}
              style={[
                styles.rating,
                styles.outlineText,
                { color: colors[0], transform: [{ translateX: x }, { translateY: y }] },
              ]}
            >
              {display}
            </Text>
          ))}
        </View>
      )}
      <Text
        testID="dx-rating-card-value"
        style={[styles.rating, styles.outlinedValueFill, { color: fallbackColor }]}
      >
        {display}
      </Text>
    </View>
  );
}

const RATING_OUTLINE_OFFSETS = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
] as const;

function RatingOutlineMask({ display }: { display: string }) {
  return (
    <View style={styles.outlineMask}>
      {RATING_OUTLINE_OFFSETS.map(({ x, y }) => (
        <Text
          key={`${x}:${y}`}
          style={[
            styles.rating,
            styles.outlineText,
            styles.outlineMaskText,
            { transform: [{ translateX: x }, { translateY: y }] },
          ]}
        >
          {display}
        </Text>
      ))}
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
  outlinedValueWrap: { height: 51, alignSelf: 'stretch' },
  outlinedValueFill: { zIndex: 1 },
  outlineMask: { flex: 1 },
  outlineText: { ...StyleSheet.absoluteFillObject },
  outlineMaskText: { color: '#000000' },
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
