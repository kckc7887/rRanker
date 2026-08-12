import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SPECIAL_DIFFICULTY_GRADIENT } from '@/components/special-difficulty-theme';
import type { BadgePresentation } from '@/features/game-content/presentation';
import { useAppTheme } from '@/theme/app-theme';

const DIFFICULTY_THEME: Record<string, { background: string; border: string; text: string }> = {
  'tuf-p': { background: '#209FCB', border: '#45C9F4', text: '#FFFFFF' },
  'tuf-g': { background: '#5968AA', border: '#8B97D5', text: '#FFFFFF' },
  'tuf-u': { background: '#C53E3B', border: '#F15B55', text: '#FFFFFF' },
};

export function TufDifficultyBadge({
  difficulty,
  display = 'label-and-value',
  style,
}: {
  difficulty: BadgePresentation;
  display?: 'label' | 'value' | 'label-and-value';
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const text = display === 'label'
    ? difficulty.label
    : display === 'value'
      ? difficulty.value ?? '—'
      : `${difficulty.label}${difficulty.value ? ` · ${difficulty.value}` : ''}`;
  const accessibilityLabel = `难度 ${difficulty.label}${difficulty.value ? `，基准分 ${difficulty.value}` : ''}`;

  if (difficulty.tone === 'tuf-special') {
    return <LinearGradient accessibilityLabel={accessibilityLabel} colors={SPECIAL_DIFFICULTY_GRADIENT}
      end={{ x: 1, y: 0.5 }} start={{ x: 0, y: 0.5 }} style={[styles.badge, style]}>
      <View pointerEvents="none" style={styles.specialOverlay} />
      <Text numberOfLines={1} style={styles.text}>{text}</Text>
    </LinearGradient>;
  }

  const colors = DIFFICULTY_THEME[difficulty.tone] ?? {
    background: theme.surfaceMuted,
    border: theme.border,
    text: theme.textSecondary,
  };
  return <View accessibilityLabel={accessibilityLabel}
    style={[styles.badge, { backgroundColor: colors.background, borderColor: colors.border }, style]}>
    <Text numberOfLines={1} style={[styles.text, { color: colors.text }]}>{text}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 32,
    height: 24,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  specialOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,14,38,0.24)' },
  text: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.25 },
});
