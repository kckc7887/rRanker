import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { museDashMetalGradient, museDashToneColor } from '@/domain/musedash-tone-theme';

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

/** 金色/银色渐变胶囊（金色 BADGE_GOLD 同款渐变 + 深字，银色仿中二 platinum）。 */
function MetalBadge({ label, kind, testID }: { label: string; kind: 'gold' | 'silver'; testID?: string }) {
  const metal = museDashMetalGradient(kind);
  return (
    <LinearGradient
      colors={metal.border}
      end={{ x: 1, y: 0.5 }}
      start={{ x: 0, y: 0.5 }}
      style={styles.metalFrame}
      testID={testID}
    >
      <LinearGradient
        colors={metal.fill}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.metalFill}
      >
        <Text style={[BADGE_STYLES.text, { color: metal.text }]}>{label}</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

/** 评价胶囊：S 按 ACC 分金银红（金/银为渐变胶囊），A 蓝、B 绿、C 灰、D 紫（沿用 ACC 同档色）。 */
export function MuseDashGradeBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  if (tone === 'acc-gold') return <MetalBadge kind="gold" label={label} testID={testID} />;
  if (tone === 'acc-silver') return <MetalBadge kind="silver" label={label} testID={testID} />;
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

/** 成就胶囊：AP 金（渐变）、FC 粉。 */
export function MuseDashAchievementBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  if (tone === 'achievement-ap') return <MetalBadge kind="gold" label={label} testID={testID} />;
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

/** 排名胶囊：#1 彩虹（LayeredGradientBadge 由调用方渲染），<10 金（渐变）、<50 蓝、<100 绿。 */
export function MuseDashRankBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  if (tone === 'rank-gold') return <MetalBadge kind="gold" label={label} testID={testID} />;
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

const styles = StyleSheet.create({
  metalFrame: { minWidth: 32, height: 24, borderRadius: 999, padding: 2, overflow: 'hidden' },
  metalFill: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
