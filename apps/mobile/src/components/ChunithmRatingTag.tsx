import { StyleSheet, Text, View } from 'react-native';
import { resolveChunithmRatingCardTheme } from '@/domain/chunithm-rating-theme';
import { TintedRatingTag } from '@/components/TintedRatingTag';

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
      <View accessibilityLabel="Rating —" style={styles.empty}>
        <Text style={styles.emptyValue}>—</Text>
      </View>
    );
  }

  const value = rating.toFixed(2);
  const theme = resolveChunithmRatingCardTheme(rating, ratingPossession);
  return (
    <TintedRatingTag
      theme={theme}
      display={value}
      accessibilityLabel={`Rating ${value}，背景 ${theme.label}`}
      testID="chunithm-rating-tag-border"
      fillTestID="chunithm-rating-tag"
      tagStyle={styles.tag}
    />
  );
}

const styles = StyleSheet.create({
  /** 中二标签以纵向内边距撑高，不走公共骨架的最小高度。 */
  tag: { minHeight: 0, paddingHorizontal: 10, paddingVertical: 5 },
  empty: {
    alignSelf: 'flex-start',
    minWidth: 70,
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyValue: { color: '#6B7280', fontSize: 13, fontWeight: '800', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
});
