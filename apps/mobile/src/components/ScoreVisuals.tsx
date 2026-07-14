import { useEffect, useRef, useState } from 'react';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Difficulty } from '@/domain/models';
import {
  formatAchievement, isNearMissAchievement, scoreRateEffect, scoreRateLabel,
} from '@/domain/score-presentation';

type GradientColors = readonly [string, string, ...string[]];

const RAINBOW: GradientColors = ['#ff8a96', '#ffc888', '#f0e470', '#78e8a0', '#78c8ff', '#a89cf8', '#f08ade'];
const FLOWING_RAINBOW: GradientColors = [
  '#ff8a96', '#ffc888', '#f0e470', '#78e8a0', '#78c8ff', '#a89cf8', '#f08ade',
  '#ff8a96', '#ffc888', '#f0e470', '#78e8a0', '#78c8ff', '#a89cf8', '#f08ade', '#ff8a96',
];

interface BlurSpec {
  bg: string;
  border: string;
  text: string;
}

const RAINBOW_BLUR: BlurSpec = { bg: 'rgba(255,179,186,0.28)', border: 'rgba(255,160,170,0.55)', text: '#f08a96' };
const GOLD_BLUR: BlurSpec = { bg: 'rgba(240,220,170,0.28)', border: 'rgba(212,180,90,0.55)', text: '#dbb860' };
const GREEN_BLUR: BlurSpec = { bg: 'rgba(180,235,200,0.28)', border: 'rgba(120,210,155,0.55)', text: '#7ad4a0' };
const BLUE_BLUR: BlurSpec = { bg: 'rgba(180,220,245,0.28)', border: 'rgba(120,180,220,0.55)', text: '#7ab8dc' };
const NEUTRAL_BLUR: BlurSpec = { bg: 'rgba(156,163,175,0.28)', border: 'rgba(156,163,175,0.55)', text: '#4B5563' };

const SHIMMER: GradientColors = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'];

function blurSpec(color: 'rainbow' | 'gold' | 'green' | 'blue'): BlurSpec {
  switch (color) {
    case 'rainbow': return RAINBOW_BLUR;
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

export function DifficultyBadge({ difficulty, constant, compact = false }: {
  difficulty: Difficulty;
  constant?: number;
  compact?: boolean;
}) {
  const visual = DIFFICULTY_VISUAL[difficulty];
  const constantText = constant === undefined ? '' : ` (${constant.toFixed(1)})`;
  return <View style={[
    styles.difficultyBadge, compact && styles.difficultyBadgeCompact,
    { backgroundColor: visual.badgeBackground, borderColor: visual.badgeBorder },
  ]}>
    <Text numberOfLines={1} style={[
      styles.difficultyText, compact && styles.difficultyTextCompact, { color: visual.badgeText },
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
      <LinearGradient colors={FLOWING_RAINBOW} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />
    </Animated.View> : <LinearGradient colors={RAINBOW} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />}
  </MaskedView>;
}

function RateBadge({ value }: { value: string }) {
  const label = scoreRateLabel(value);
  switch (scoreRateEffect(value)) {
    case 'flowing-rainbow': return <BlurBadge label={label} spec={RAINBOW_BLUR} flowing testID={`flowing-rate-${label}`} />;
    case 'rainbow': return <BlurBadge label={label} spec={RAINBOW_BLUR} testID={`rainbow-rate-${label}`} />;
    case 'flowing-gold': return <BlurBadge label={label} spec={GOLD_BLUR} flowing testID={`flowing-rate-${label}`} />;
    case 'gold': return <BlurBadge label={label} spec={GOLD_BLUR} testID={`rate-${label}`} />;
    default: return <View style={[styles.statusBadge, styles.normalBadge]}><Text style={[styles.statusText, styles.normalText]}>{label}</Text></View>;
  }
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: spec.bg, borderRadius: 8 }]} />
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
  label: string; flowing: boolean; color: 'rainbow' | 'gold' | 'green' | 'blue';
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
  difficultyText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  difficultyTextCompact: { fontSize: 9, letterSpacing: 0.25 },
  achievement: { fontSize: 36, lineHeight: 44, fontWeight: '900', letterSpacing: -1.3, textShadowColor: 'rgba(255,255,255,0.8)', textShadowRadius: 2 },
  achievementCompact: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  achievementNormal: { color: '#172033' },
  achievementMask: { alignSelf: 'stretch', height: 44 }, achievementMaskCompact: { height: 28 },
  achievementMaskContent: { flex: 1, alignItems: 'flex-start' }, maskText: { color: '#000000' },
  gradientFill: { ...StyleSheet.absoluteFillObject }, flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  statusBadge: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  statusText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.45 },
  normalBadge: { backgroundColor: '#E5E7EB' }, normalText: { color: '#374151' },
});
