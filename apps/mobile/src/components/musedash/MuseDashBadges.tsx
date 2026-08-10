import { StyleSheet, Text, View } from 'react-native';
import { museDashToneColor } from '@/domain/musedash-tone-theme';

const BADGE_STYLES = StyleSheet.create({
  badge: {
    minWidth: 32,
    height: 24,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.35, includeFontPadding: false },
});

/** 评价胶囊：S 按 ACC 分金银红，A 蓝、B 绿、C 灰、D 紫（沿用 ACC 同档色）。 */
export function MuseDashGradeBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

/** 成就胶囊：AP 金、FC 粉。 */
export function MuseDashAchievementBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

/** 排名胶囊：#1 彩虹（LayeredGradientBadge 由调用方渲染），<10 金、<50 蓝、<100 绿。 */
export function MuseDashRankBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

/** 信息胶囊（角色/精灵/平台等）：中性灰底白字。 */
export function MuseDashNeutralBadge({ label, testID }: { label: string; testID?: string }) {
  return <View style={[BADGE_STYLES.badge, { backgroundColor: '#9CA3AF' }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}
