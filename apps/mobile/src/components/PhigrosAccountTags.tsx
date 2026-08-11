import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';

/** 账号列表用的 Phigros RKS 数字标签，背景与边框由课题模式配色决定；无课题模式时使用白档。 */
export function PhigrosAccountTags({ rks, challengeModeRank }: {
  rks: string;
  challengeModeRank?: number | null;
}) {
  const rksNumber = Number(rks);
  const rksDisplay = Number.isFinite(rksNumber) ? rksNumber.toFixed(2) : '—';
  const challenge = resolvePhigrosChallengeTheme(challengeModeRank ?? 0);
  return (
    <LinearGradient
      accessibilityLabel={`RKS ${rksDisplay}`}
      colors={[...challenge.borderColors]}
      locations={[...challenge.borderLocations]}
      start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
      style={styles.border}
      testID="phigros-rks-tag-border"
    >
      <LinearGradient
        colors={[...challenge.fillColors]}
        locations={[...challenge.fillLocations]}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={styles.tag}
        testID="phigros-rks-tag"
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: challenge.overlayColor }]} />
        <Text style={[styles.rksValue, { color: challenge.textColor }]}>{rksDisplay}</Text>
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
    minHeight: 28,
    borderRadius: 8,
    paddingHorizontal: 9,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  rksValue: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
