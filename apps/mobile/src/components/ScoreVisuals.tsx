import { useEffect, useRef, useState } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Difficulty } from '@/domain/models';
import {
  formatAchievement, isNearMissAchievement, scoreRateEffect, scoreRateLabel,
} from '@/domain/score-presentation';

type GradientColors = readonly [string, string, ...string[]];

const RAINBOW: GradientColors = ['#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#d4baff', '#ffb3f0'];
const FLOWING_RAINBOW: GradientColors = [
  '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#d4baff', '#ffb3f0',
  '#ffb3ba', '#ffdfba', '#ffffba', '#baffc9', '#bae1ff', '#d4baff', '#ffb3f0', '#ffb3ba',
];
const GOLD: GradientColors = ['#ffe69a', '#f5d278', '#fff4c8'];
const FLOWING_GOLD: GradientColors = [
  '#ffe69a', '#f5d278', '#fff4c8', '#ffe69a', '#f5d278', '#fff4c8', '#ffe69a',
];
const GREEN: GradientColors = ['#d4f0dc', '#b0e8c4', '#e8f8ec'];
const FLOWING_GREEN: GradientColors = [
  '#d4f0dc', '#b0e8c4', '#e8f8ec', '#d4f0dc', '#b0e8c4', '#e8f8ec', '#d4f0dc',
];
const BLUE: GradientColors = ['#d4e4f8', '#b0d0ec', '#e8f0fc'];
const FLOWING_BLUE: GradientColors = [
  '#d4e4f8', '#b0d0ec', '#e8f0fc', '#d4e4f8', '#b0d0ec', '#e8f0fc', '#d4e4f8',
];

const RAINBOW_TEXT = '#3a2030';
const GOLD_TEXT = '#4a3000';
const GREEN_TEXT = '#15502a';
const BLUE_TEXT = '#153c60';

export interface DifficultyVisual {
  label: string;
  color: string;
  tint: string;
  badgeBackground: string;
  badgeText: string;
  badgeBorder: string;
}

export const DIFFICULTY_VISUAL: Record<Difficulty, DifficultyVisual> = {
  remaster: { label: 'Re:MASTER', color: '#A65DB9', tint: '#FFF0F6', badgeBackground: '#FFFFFF', badgeText: '#8B4FA8', badgeBorder: '#CFA7DB' },
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
    case 'flowing-rainbow': return <GradientBadge label={label} colors={FLOWING_RAINBOW} flowing testID={`flowing-rate-${label}`} textColor={RAINBOW_TEXT} />;
    case 'rainbow': return <GradientBadge label={label} colors={RAINBOW} testID={`rainbow-rate-${label}`} textColor={RAINBOW_TEXT} />;
    case 'flowing-gold': return <GradientBadge label={label} colors={FLOWING_GOLD} flowing testID={`flowing-rate-${label}`} textColor={GOLD_TEXT} />;
    case 'gold': return <GradientBadge label={label} colors={GOLD} testID={`rate-${label}`} textColor={GOLD_TEXT} />;
    default: return <View style={[styles.statusBadge, styles.normalBadge]}><Text style={[styles.statusText, styles.normalText]}>{label}</Text></View>;
  }
}

function NearMissBadge() {
  return <View accessibilityLabel="寸" style={[styles.statusBadge, styles.nearMissBadge]}>
    <Text style={[styles.statusText, styles.nearMissText]}>寸</Text>
  </View>;
}

function StatusBadge({ kind, value }: { kind: 'fc' | 'fs'; value: string }) {
  const spec = getStatusSpec(kind, value);
  return <GradientBadge label={spec.label} colors={spec.colors} flowing={spec.flowing}
    testID={spec.flowing ? `flowing-status-${spec.label}` : `status-${spec.label}`} textColor={spec.textColor} />;
}

function GradientBadge({ label, colors, flowing = false, testID, textColor }: {
  label: string; colors: GradientColors; flowing?: boolean; testID: string; textColor: string;
}) {
  const [width, setWidth] = useState(52);
  const progress = useFlowingProgress(flowing, 1250);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return <View testID={testID} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={[styles.statusBadge, styles.gradientBadge]}>
    {flowing ? <Animated.View pointerEvents="none"
      style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />
    </Animated.View> : <LinearGradient pointerEvents="none" colors={colors}
      start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />}
    <View style={styles.glowHighlight} />
    <Text style={[styles.statusText, { color: textColor }]}>{label}</Text>
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
  label: string; flowing: boolean; colors: GradientColors; textColor: string;
} {
  const value = rawValue.toLowerCase();
  if (kind === 'fc') {
    if (value === 'fc') return { label: 'FC', flowing: false, colors: GREEN, textColor: GREEN_TEXT };
    if (value === 'fcp') return { label: 'FC+', flowing: true, colors: FLOWING_GREEN, textColor: GREEN_TEXT };
    if (value === 'ap') return { label: 'AP', flowing: false, colors: GOLD, textColor: GOLD_TEXT };
    if (value === 'app') return { label: 'AP+', flowing: true, colors: FLOWING_GOLD, textColor: GOLD_TEXT };
  } else {
    if (value === 'sync') return { label: 'SYNC', flowing: false, colors: BLUE, textColor: BLUE_TEXT };
    if (value === 'fs' || value === 'fsp') return { label: value === 'fsp' ? 'FS+' : 'FS', flowing: true, colors: FLOWING_BLUE, textColor: BLUE_TEXT };
    if (value === 'fsd') return { label: 'FDX', flowing: false, colors: GOLD, textColor: GOLD_TEXT };
    if (value === 'fsdp') return { label: 'FDX+', flowing: true, colors: FLOWING_GOLD, textColor: GOLD_TEXT };
  }
  return { label: rawValue.toUpperCase(), flowing: false, colors: ['#E5E7EB', '#E5E7EB'], textColor: '#374151' };
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
  gradientBadge: { backgroundColor: '#FFFFFF' },
  glowHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.4)' },
  normalBadge: { backgroundColor: '#E5E7EB' }, normalText: { color: '#374151' },
  nearMissBadge: { backgroundColor: '#36A269' }, nearMissText: { color: '#FFFFFF' },
});
