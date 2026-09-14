import { StyleSheet } from 'react-native';
import { AnimatedMetricValue } from '@/components/game-content/AnimatedMetricValue';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { METRIC_GRADIENT_THEMES } from '@/domain/metric-gradient-theme';
import { rizlineDifficultyColors, rizlineRecordStatus, type RizlineDifficulty, type RizlineRecord } from '@/domain/rizline';
import { useAppTheme } from '@/theme/app-theme';

export function RizlineDifficultyBadge({ difficulty, level }: { difficulty: RizlineDifficulty; level?: string }) {
  const theme = useAppTheme();
  const colors = rizlineDifficultyColors(difficulty, theme.dark);
  return <GameDifficultyBadge text={`${difficulty}${level === undefined ? '' : ` ${level}`}`}
    theme={{ background: colors.bg, border: colors.bg, text: colors.fg }}
    testID={`rizline-difficulty-${difficulty}`} />;
}

export function RizlineApBadge() {
  return <LayeredGradientBadge label="AP" tone="gold" style={styles.statusBadge} textStyle={styles.statusText} testID="rizline-status-ap" />;
}

export function RizlineStatusBadge({ record }: { record?: RizlineRecord }) {
  const status = rizlineRecordStatus(record);
  if (status === 'ap') return <RizlineApBadge />;
  if (status === 'normal') return null;
  return <GameDifficultyBadge text="AH" accessibilityLabel="AH"
    theme={{ background: METRIC_GRADIENT_THEMES.mint.baseColors[0], border: '#278C76', text: '#082326' }}
    special={{ gradient: METRIC_GRADIENT_THEMES.mint.baseColors, textColor: '#082326' }}
    style={styles.ahBadge} testID="rizline-status-ah" />;
}

export function RizlineAccuracyValue({ record, text, fontSize = 19, lineHeight = 25 }: {
  record?: RizlineRecord; text: string; fontSize?: number; lineHeight?: number;
}) {
  const theme = useAppTheme();
  const status = rizlineRecordStatus(record);
  const gradient = status === 'normal' ? undefined : METRIC_GRADIENT_THEMES[status === 'ap' ? 'gold' : 'mint'];
  return <AnimatedMetricValue text={text} textColor={theme.text} fontSize={fontSize} lineHeight={lineHeight}
    gradient={gradient ? { colors: gradient.colors, duration: gradient.duration, testID: `rizline-flowing-accuracy-${status}` } : undefined} />;
}

const styles = StyleSheet.create({
  statusBadge: { height: 24, minWidth: 32, paddingHorizontal: 2 },
  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.25, paddingHorizontal: 6 },
  ahBadge: { borderColor: '#278C76', overflow: 'hidden' },
});
