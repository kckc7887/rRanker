import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  formatPhigrosChallengeBadge,
  resolvePhigrosChallengeTheme,
} from '@/domain/phigros-challenge-theme';

export function PhigrosAccountTags({ rks, challengeModeRank }: {
  rks: string;
  challengeModeRank?: number | null;
}) {
  const challenge = challengeModeRank == null
    ? null
    : resolvePhigrosChallengeTheme(challengeModeRank);
  return <View style={styles.row}>
    <View style={[styles.tag, styles.rks]} accessibilityLabel={`RKS ${rks}`}>
      <Text style={styles.rksLabel}>RKS</Text><Text style={styles.rksValue}>{rks}</Text>
    </View>
    {challenge ? <LinearGradient
      colors={[...challenge.borderColors]}
      locations={[...challenge.borderLocations]}
      start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
      style={styles.challengeBorder}
      accessibilityLabel={`课题模式 ${formatPhigrosChallengeBadge(challengeModeRank!)}`}
    >
      <LinearGradient colors={[...challenge.fillColors]} locations={[...challenge.fillLocations]}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.tag}>
        <Text style={[styles.challengeValue, { color: challenge.textColor }]}>
          {formatPhigrosChallengeBadge(challengeModeRank!)}
        </Text>
      </LinearGradient>
    </LinearGradient> : <View style={[styles.tag, styles.empty]}><Text style={styles.emptyValue}>—</Text></View>}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  tag: { minHeight: 28, borderRadius: 8, paddingHorizontal: 9, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 5 },
  rks: { backgroundColor: '#242934' }, rksLabel: { color: '#9DE7E7', fontSize: 9, fontWeight: '800' },
  rksValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  challengeBorder: { borderRadius: 9, padding: 1.5 }, challengeValue: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  empty: { backgroundColor: '#E5E7EB' }, emptyValue: { color: '#6B7280', fontSize: 13, fontWeight: '800' },
});
