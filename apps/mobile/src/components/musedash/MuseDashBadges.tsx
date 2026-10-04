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

export function MuseDashGradeBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  if (tone === 'acc-gold') return <MetalBadge kind="gold" label={label} testID={testID} />;
  if (tone === 'acc-silver') return <MetalBadge kind="silver" label={label} testID={testID} />;
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

export function MuseDashAchievementBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  if (tone === 'achievement-ap') return <MetalBadge kind="gold" label={label} testID={testID} />;
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

export function MuseDashRankBadge({ label, tone, testID }: { label: string; tone: string; testID?: string }) {
  if (tone === 'rank-gold') return <MetalBadge kind="gold" label={label} testID={testID} />;
  const color = museDashToneColor(tone) ?? '#6B7280';
  return <View style={[BADGE_STYLES.badge, { backgroundColor: color }]} testID={testID}>
    <Text style={BADGE_STYLES.text}>{label}</Text>
  </View>;
}

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
