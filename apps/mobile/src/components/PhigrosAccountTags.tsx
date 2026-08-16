import { StyleSheet } from 'react-native';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { TintedRatingTag } from '@/components/TintedRatingTag';

/** 账号列表用的 Phigros RKS 数字标签，背景与边框由课题模式配色决定；无课题模式时使用白档。 */
export function PhigrosAccountTags({ rks, challengeModeRank }: {
  rks: string;
  challengeModeRank?: number | null;
}) {
  const rksNumber = Number(rks);
  const rksDisplay = Number.isFinite(rksNumber) ? rksNumber.toFixed(2) : '—';
  const challenge = resolvePhigrosChallengeTheme(challengeModeRank ?? 0);
  return (
    <TintedRatingTag
      theme={challenge}
      display={rksDisplay}
      accessibilityLabel={`RKS ${rksDisplay}`}
      testID="phigros-rks-tag-border"
      fillTestID="phigros-rks-tag"
      valueStyle={styles.value}
    />
  );
}

const styles = StyleSheet.create({
  /** Phigros 数值文本无字距。 */
  value: { letterSpacing: 0 },
});
