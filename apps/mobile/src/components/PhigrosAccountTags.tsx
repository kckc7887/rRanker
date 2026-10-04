import { StyleSheet } from 'react-native';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { TintedRatingTag } from '@/components/TintedRatingTag';

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
  value: { letterSpacing: 0 },
});
