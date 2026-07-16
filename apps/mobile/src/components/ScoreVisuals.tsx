import { useEffect, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import type { Difficulty } from '@/domain/models';
import {
  formatAchievement, isNearMissAchievement, scoreRateEffect, scoreRateLabel,
} from '@/domain/score-presentation';
import {
  BEST_IMAGE_RAINBOW_COLORS,
  STATUS_BADGE_THEMES,
} from '@/features/best-image/best-image-badge-theme';

type GradientColors = readonly [string, string, ...string[]];

const RAINBOW: GradientColors = BEST_IMAGE_RAINBOW_COLORS;
const FLOWING_RAINBOW: GradientColors = [
  ...BEST_IMAGE_RAINBOW_COLORS, ...BEST_IMAGE_RAINBOW_COLORS, BEST_IMAGE_RAINBOW_COLORS[0],
];

type BlurSpec = typeof STATUS_BADGE_THEMES.gold;

const GOLD_BLUR = STATUS_BADGE_THEMES.gold;
const GREEN_BLUR = STATUS_BADGE_THEMES.green;
const BLUE_BLUR = STATUS_BADGE_THEMES.blue;
const NEUTRAL_BLUR = STATUS_BADGE_THEMES.neutral;

const SHIMMER: GradientColors = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'];

function blurSpec(color: 'gold' | 'green' | 'blue'): BlurSpec {
  switch (color) {
    case 'gold': return GOLD_BLUR;
    case 'green': return GREEN_BLUR;
    case 'blue': return BLUE_BLUR;
  }
}

export interface DifficultyVisual {
  label: string;
  color: string;
  tint: string;
  badgeBackground: string;
  badgeText: string;
  badgeBorder: string;
}

export const DIFFICULTY_VISUAL: Record<Difficulty, DifficultyVisual> = {
  remaster: { label: 'Re:MASTER', color: '#A65DB9', tint: '#F3E8FE', badgeBackground: '#FFFFFF', badgeText: '#8B4FA8', badgeBorder: '#CFA7DB' },
  master: { label: 'MASTER', color: '#7137C8', tint: '#E9DDFF', badgeBackground: '#7137C8', badgeText: '#FFFFFF', badgeBorder: '#7137C8' },
  expert: { label: 'EXPERT', color: '#D84B68', tint: '#FFF0F3', badgeBackground: '#D84B68', badgeText: '#FFFFFF', badgeBorder: '#D84B68' },
  advanced: { label: 'ADVANCED', color: '#E39124', tint: '#FFF6E8', badgeBackground: '#E39124', badgeText: '#FFFFFF', badgeBorder: '#E39124' },
  basic: { label: 'BASIC', color: '#3E9D6B', tint: '#ECF8F1', badgeBackground: '#3E9D6B', badgeText: '#FFFFFF', badgeBorder: '#3E9D6B' },
  unknown: { label: 'UNKNOWN', color: '#6B7280', tint: '#F3F4F6', badgeBackground: '#6B7280', badgeText: '#FFFFFF', badgeBorder: '#6B7280' },
};

export function DifficultyBadge({ difficulty, constant, compact = false, mini = false }: {
  difficulty: Difficulty;
  constant?: number;
  compact?: boolean;
  mini?: boolean;
}) {
  const visual = DIFFICULTY_VISUAL[difficulty];
  const constantText = constant === undefined ? '' : ` (${constant.toFixed(1)})`;
  return <View style={[
    styles.difficultyBadge,
    compact && !mini && styles.difficultyBadgeCompact,
    mini && styles.difficultyBadgeMini,
    { backgroundColor: visual.badgeBackground, borderColor: visual.badgeBorder },
  ]}>
    <Text numberOfLines={1} style={[
      styles.difficultyText,
      compact && !mini && styles.difficultyTextCompact,
      mini && styles.difficultyTextMini,
      { color: visual.badgeText },
    ]}>{visual.label}{constantText}</Text>
  </View>;
}

export function AchievementValue({ value, compact = false }: { value?: number; compact?: boolean }) {
  const textStyle = [styles.achievement, compact && styles.achievementCompact];
  if (value === undefined) return <Text accessibilityLabel="未游玩" style={[...textStyle, styles.achievementNormal]}>—</Text>;
  const text = formatAchievement(value);
  if (value >= 100.5) return <GradientAchievement text={text} flowing compact={compact} />;
  if (value >= 99.9999) return <GradientAchievement text={text} compact={compact} />;
  const color = value >= 99.4999 ? '#D7C08A' : value >= 98.9999 ? '#D69B24' : '#172033';
  return <Text accessibilityLabel={text} style={[...textStyle, { color }]}>{text}</Text>;
}

export function ScoreStatusBadges({ rate, achievements, fc, fs }: {
  rate?: string | null;
  achievements?: number;
  fc?: string | null;
  fs?: string | null;
}) {
  return <>
    {rate ? <RateBadge value={rate} /> : null}
    {achievements !== undefined && isNearMissAchievement(achievements) ? <NearMissBadge /> : null}
    {fc ? <StatusBadge kind="fc" value={fc} /> : null}
    {fs ? <StatusBadge kind="fs" value={fs} /> : null}
  </>;
}

function GradientAchievement({ text, flowing = false, compact = false }: {
  text: string; flowing?: boolean; compact?: boolean;
}) {
  const [width, setWidth] = useState(compact ? 170 : 260);
  const progress = useFlowingProgress(flowing, 1800);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  const textStyle = [styles.achievement, compact && styles.achievementCompact, styles.maskText];
  return <MaskedView accessible accessibilityLabel={text} testID={flowing ? 'flowing-achievement' : 'rainbow-achievement'}
    onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={[styles.achievementMask, compact && styles.achievementMaskCompact]}
    maskElement={<View style={styles.achievementMaskContent}><Text style={textStyle}>{text}</Text></View>}>
    {flowing ? <Animated.View style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
      <LinearGradient testID="flowing-achievement-gradient" colors={FLOWING_RAINBOW}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />
    </Animated.View> : <LinearGradient testID="rainbow-achievement-gradient" colors={RAINBOW}
      start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />}
  </MaskedView>;
}

function RateBadge({ value }: { value: string }) {
  const label = scoreRateLabel(value);
  switch (scoreRateEffect(value)) {
    case 'flowing-rainbow': return <RateGradientBadge label={label} tone="rainbow" flowing testID={`flowing-rate-${label}`} />;
    case 'rainbow': return <RateGradientBadge label={label} tone="rainbow" testID={`rainbow-rate-${label}`} />;
    case 'flowing-gold': return <RateGradientBadge label={label} tone="gold" flowing testID={`flowing-rate-${label}`} />;
    case 'gold': return <RateGradientBadge label={label} tone="gold" testID={`rate-${label}`} />;
    default: return <View style={[styles.statusBadge, styles.normalBadge]}><Text style={[styles.statusText, styles.normalText]}>{label}</Text></View>;
  }
}

function RateGradientBadge({ label, tone, flowing = false, testID }: {
  label: string;
  tone: 'rainbow' | 'gold';
  flowing?: boolean;
  testID: string;
}) {
  return (
    <LayeredGradientBadge
      contentStyle={styles.layeredRateContent}
      flowing={flowing}
      label={label}
      style={styles.layeredRateFrame}
      testID={testID}
      textStyle={styles.statusText}
      tone={tone}
    />
  );
}

function NearMissBadge() {
  return <BlurBadge label="寸" spec={NEUTRAL_BLUR} testID="near-miss-badge" />;
}

function StatusBadge({ kind, value }: { kind: 'fc' | 'fs'; value: string }) {
  const spec = getStatusSpec(kind, value);
  return <BlurBadge label={spec.label} spec={blurSpec(spec.color)} flowing={spec.flowing}
    testID={spec.flowing ? `flowing-status-${spec.label}` : `status-${spec.label}`} />;
}

function BlurBadge({ label, spec, flowing = false, testID }: {
  label: string; spec: BlurSpec; flowing?: boolean; testID: string;
}) {
  const [width, setWidth] = useState(52);
  const progress = useFlowingProgress(flowing, 1400);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return <View testID={testID} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={[styles.statusBadge, { borderWidth: 1, borderColor: spec.border }]}>
    <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: spec.background, borderRadius: 8 }]} />
    {flowing ? <Animated.View pointerEvents="none"
      style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
      <LinearGradient colors={SHIMMER} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />
    </Animated.View> : null}
    <Text style={[styles.statusText, { color: spec.text }]}>{label}</Text>
  </View>;
}

function useFlowingProgress(enabled: boolean, duration: number): Animated.Value {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    if (!enabled) return;
    const animation = Animated.loop(Animated.timing(progress, {
      toValue: 1, duration, easing: Easing.linear, useNativeDriver: true,
    }));
    animation.start();
    return () => animation.stop();
  }, [duration, enabled, progress]);
  return progress;
}

function getStatusSpec(kind: 'fc' | 'fs', rawValue: string): {
  label: string; flowing: boolean; color: 'gold' | 'green' | 'blue';
} {
  const value = rawValue.toLowerCase();
  if (kind === 'fc') {
    if (value === 'fc') return { label: 'FC', flowing: false, color: 'green' };
    if (value === 'fcp') return { label: 'FC+', flowing: true, color: 'green' };
    if (value === 'ap') return { label: 'AP', flowing: false, color: 'gold' };
    if (value === 'app') return { label: 'AP+', flowing: true, color: 'gold' };
  } else {
    if (value === 'sync') return { label: 'SYNC', flowing: false, color: 'blue' };
    if (value === 'fs' || value === 'fsp') return { label: value === 'fsp' ? 'FS+' : 'FS', flowing: true, color: 'blue' };
    if (value === 'fsd') return { label: 'FDX', flowing: false, color: 'gold' };
    if (value === 'fsdp') return { label: 'FDX+', flowing: true, color: 'gold' };
  }
  return { label: rawValue.toUpperCase(), flowing: false, color: 'gold' };
}

const styles = StyleSheet.create({
  difficultyBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  difficultyBadgeCompact: { paddingHorizontal: 8, paddingVertical: 5 },
  difficultyBadgeMini: { paddingHorizontal: 5, paddingVertical: 2 },
  difficultyText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  difficultyTextCompact: { fontSize: 9, letterSpacing: 0.25 },
  difficultyTextMini: { fontSize: 8, letterSpacing: 0.1, fontWeight: '800' },
  achievement: { fontSize: 36, lineHeight: 44, fontWeight: '900', letterSpacing: -1.3, textShadowColor: 'rgba(255,255,255,0.8)', textShadowRadius: 2 },
  achievementCompact: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  achievementNormal: { color: '#172033' },
  achievementMask: { alignSelf: 'stretch', height: 44 }, achievementMaskCompact: { height: 28 },
  achievementMaskContent: { flex: 1, alignItems: 'flex-start' }, maskText: { color: '#000000' },
  gradientFill: { ...StyleSheet.absoluteFillObject }, flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  statusBadge: { minWidth: 32, height: 24, borderRadius: 9, paddingHorizontal: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  layeredRateFrame: { minWidth: 32, height: 24 },
  layeredRateContent: { paddingHorizontal: 8 },
  statusText: { fontSize: 10, lineHeight: 12, fontWeight: '900', letterSpacing: 0.45, textAlign: 'center', includeFontPadding: false },
  normalBadge: { backgroundColor: '#E5E7EB' }, normalText: { color: '#374151' },
});
