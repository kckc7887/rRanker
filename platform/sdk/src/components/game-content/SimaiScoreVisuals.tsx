import { useState } from 'react';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LayeredGradientBadge } from '@rranker/sdk/components/LayeredGradientBadge';
import { FlowingGradientValue } from '@rranker/sdk/components/game-content/FlowingGradientValue';
import { useFlowingProgress } from '@rranker/sdk/components/game-content/use-flowing-progress';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { normalizeSimaiFc, normalizeSimaiFs ,
  formatAchievement, isNearMissAchievement, scoreRateEffect, scoreRateLabel,
} from '@rranker/sdk/domain/simai-score';
import {
  BEST_IMAGE_RAINBOW_COLORS,
  STATUS_BADGE_THEMES,
} from '@rranker/sdk/domain/badge-theme';

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

export function AchievementValue({ value, compact = false }: { value?: number; compact?: boolean }) {
  const theme = useAppTheme();
  const textStyle = [styles.achievement, compact && styles.achievementCompact];
  if (value === undefined) {
    return <Text accessibilityLabel="未游玩" style={[...textStyle, { color: theme.text }]}>-</Text>;
  }
  const text = formatAchievement(value);
  if (value >= 100.5) return <GradientAchievement text={text} flowing compact={compact} />;
  if (value >= 99.9999) return <GradientAchievement text={text} compact={compact} />;
  const color = value >= 99.4999 ? '#D7C08A' : value >= 98.9999 ? '#D69B24' : '#172033';
  return <Text accessibilityLabel={text} style={[...textStyle, { color: theme.dark && value < 99.4999 ? theme.text : color }]}>{text}</Text>;
}

export function ScoreStatusBadges({ rate, achievements, fc, fs, nearMissFirst = false, flowing = false }: {
  rate?: string | null;
  achievements?: number;
  fc?: string | null;
  fs?: string | null;
  nearMissFirst?: boolean;
  flowing?: boolean;
}) {
  const nearMiss = achievements !== undefined && isNearMissAchievement(achievements);
  const normalizedFc = normalizeSimaiFc(fc);
  const normalizedFs = normalizeSimaiFs(fs);
  return <>
    {nearMissFirst && nearMiss ? <NearMissBadge /> : null}
    {rate ? <RateBadge flowing={flowing} value={rate} /> : null}
    {!nearMissFirst && nearMiss ? <NearMissBadge /> : null}
    {normalizedFc ? <StatusBadge flowing={flowing} kind="fc" value={normalizedFc} /> : null}
    {normalizedFs ? <StatusBadge flowing={flowing} kind="fs" value={normalizedFs} /> : null}
  </>;
}

function GradientAchievement({ text, flowing = false, compact = false }: {
  text: string; flowing?: boolean; compact?: boolean;
}) {
  const textStyle = [styles.achievement, compact && styles.achievementCompact, styles.maskText];
  return <FlowingGradientValue accessible accessibilityLabel={text}
    testID={flowing ? 'flowing-achievement' : 'rainbow-achievement'}
    duration={1800}
    flowing={flowing}
    initialWidth={compact ? 170 : 260}
    measure="mask-layout"
    maskStyle={[styles.achievementMask, compact && styles.achievementMaskCompact]}
    maskElement={<View style={styles.achievementMaskContent}><Text style={textStyle}>{text}</Text></View>}
    trackStyle={styles.flowTrack}
    flowingColors={FLOWING_RAINBOW}
    flowingStyle={styles.gradientFill}
    flowingTestID="flowing-achievement-gradient"
    staticColors={RAINBOW}
    staticStyle={styles.gradientFill}
    staticTestID="rainbow-achievement-gradient" />;
}

function RateBadge({ value, flowing = false }: { value: string; flowing?: boolean }) {
  const label = scoreRateLabel(value);
  switch (scoreRateEffect(value)) {
    case 'flowing-rainbow': return <RateGradientBadge label={label} tone="rainbow" flowing={flowing} testID={flowing ? `flowing-rate-${label}` : `rainbow-rate-${label}`} />;
    case 'rainbow': return <RateGradientBadge label={label} tone="rainbow" testID={`rainbow-rate-${label}`} />;
    case 'flowing-gold': return <RateGradientBadge label={label} tone="gold" flowing={flowing} testID={flowing ? `flowing-rate-${label}` : `rate-${label}`} />;
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

function StatusBadge({ kind, value, flowing = false }: { kind: 'fc' | 'fs'; value: string; flowing?: boolean }) {
  const spec = getStatusSpec(kind, value);
  const badgeFlowing = flowing && spec.flowing;
  return <BlurBadge label={spec.label} spec={blurSpec(spec.color)} flowing={badgeFlowing}
    testID={badgeFlowing ? `flowing-status-${spec.label}` : `status-${spec.label}`} />;
}

function BlurBadge({ label, spec, flowing = false, testID }: {
  label: string; spec: BlurSpec; flowing?: boolean; testID: string;
}) {
  const theme = useAppTheme();
  const [width, setWidth] = useState(52);
  const progress = useFlowingProgress(flowing, 1400);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return <View testID={testID} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={[styles.statusBadge, { borderWidth: 1, borderColor: spec.border }]}>
    <BlurView intensity={18} tint={theme.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: spec.background, borderRadius: 8 }]} />
    {flowing ? <Animated.View pointerEvents="none"
      style={[styles.flowTrack, { width: width * 2, transform: [{ translateX }] }]}>
      <LinearGradient colors={SHIMMER} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.gradientFill} />
    </Animated.View> : null}
    <Text style={[styles.statusText, { color: spec.text }]}>{label}</Text>
  </View>;
}

function getStatusSpec(kind: 'fc' | 'fs', rawValue: string): {
  label: string; flowing: boolean; color: 'gold' | 'green' | 'blue';
} {
  const value = rawValue.trim().toLowerCase();
  if (kind === 'fc') {
    if (value === 'fc') return { label: 'FC', flowing: false, color: 'green' };
    if (value === 'fcp') return { label: 'FC+', flowing: true, color: 'green' };
    if (value === 'ap') return { label: 'AP', flowing: false, color: 'gold' };
    if (value === 'app') return { label: 'AP+', flowing: true, color: 'gold' };
  } else {
    if (value === 'fs' || value === 'fsp') {
      return {
        label: value === 'fsp' ? 'FS+' : 'FS',
        flowing: true,
        color: 'blue',
      };
    }
    if (value === 'fsd') return { label: 'FDX', flowing: false, color: 'gold' };
    if (value === 'fsdp') return { label: 'FDX+', flowing: true, color: 'gold' };
  }
  return { label: rawValue.trim().toUpperCase(), flowing: false, color: 'gold' };
}

const styles = StyleSheet.create({
achievement: { fontSize: 36, lineHeight: 44, fontWeight: '900', letterSpacing: -1.3, textShadowColor: 'rgba(255,255,255,0.8)', textShadowRadius: 2 },
achievementCompact: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
achievementMask: { alignSelf: 'stretch', height: 44 },
achievementMaskCompact: { height: 28 },
achievementMaskContent: { flex: 1, alignItems: 'flex-start' },
maskText: { color: '#000000' },
gradientFill: { ...StyleSheet.absoluteFill },
flowTrack: { position: 'absolute', top: 0, bottom: 0, left: 0 },
statusBadge: { minWidth: 32, height: 24, borderRadius: 9, paddingHorizontal: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
layeredRateFrame: { minWidth: 32, height: 24 },
layeredRateContent: { paddingHorizontal: 8 },
statusText: { fontSize: 10, lineHeight: 12, fontWeight: '900', letterSpacing: 0.45, textAlign: 'center', includeFontPadding: false },
normalBadge: { backgroundColor: '#E5E7EB', borderRadius: 999 },
normalText: { color: '#374151' }
});
