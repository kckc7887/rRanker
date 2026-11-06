import { StyleSheet } from 'react-native';
import { LayeredGradientBadge } from '@/components/LayeredGradientBadge';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { museDashMetalGradient, museDashToneColor } from '@/domain/musedash-tone-theme';

export function MuseDashBadge({ label, tone, testID }: { label: string; tone?: string; testID?: string }) {
  const kind = tone === 'acc-silver' ? 'silver'
    : tone === 'acc-gold' || tone === 'achievement-ap' || tone === 'rank-gold' ? 'gold' : null;
  if (kind) return <LayeredGradientBadge label={label} tone={{ ...museDashMetalGradient(kind), overlay: null }}
    style={styles.metal} contentStyle={styles.fill} textStyle={styles.text} testID={testID} />;
  const background = tone ? museDashToneColor(tone) ?? '#6B7280' : '#9CA3AF';
  return <GameDifficultyBadge text={label} theme={{ background, border: background, text: '#FFFFFF' }}
    style={styles.plain} textStyle={styles.text} testID={testID} />;
}

const styles = StyleSheet.create({
  metal: { minWidth: 32, height: 24 },
  fill: { paddingHorizontal: 8 },
  plain: { borderWidth: 0, paddingHorizontal: 10 },
  text: { fontSize: 10, fontWeight: '900', letterSpacing: 0.35, includeFontPadding: false },
});
