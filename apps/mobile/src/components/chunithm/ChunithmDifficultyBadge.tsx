import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmLevelIndex,
} from '@/domain/chunithm';
import { CHUNITHM_DIFFICULTY_THEME } from '@/domain/chunithm-level-theme';
import { SPECIAL_DIFFICULTY_GRADIENT } from '@/components/special-difficulty-theme';

export const CHUNITHM_WORLDS_END_GRADIENT = SPECIAL_DIFFICULTY_GRADIENT;

export type ChunithmDifficultyBadgeDisplay = 'constant' | 'label' | 'label-and-value';

export function ChunithmDifficultyBadge({
  levelIndex,
  level,
  constant,
  display = 'constant',
  worldsEndLabel,
}: {
  levelIndex: ChunithmLevelIndex;
  level?: string;
  constant?: number;
  display?: ChunithmDifficultyBadgeDisplay;
  worldsEndLabel?: string;
}) {
  const colors = CHUNITHM_DIFFICULTY_THEME[levelIndex];
  const label = CHUNITHM_DIFFICULTY_LABELS[levelIndex];
  const constantText = constant === undefined ? '—' : constant.toFixed(1);
  const valueText = levelIndex === 5 ? (worldsEndLabel?.trim() || '—') : constantText;
  const text = display === 'label'
    ? label
    : display === 'label-and-value'
      ? `${label} (${valueText})`
      : valueText;
  const accessibilityLabel = levelIndex === 5
    ? `${label}，属性星级 ${valueText}`
    : `${label}，标级 ${level ?? '未知'}，定数 ${constantText}`;

  if (levelIndex === 5) {
    return (
      <LinearGradient
        accessibilityLabel={accessibilityLabel}
        colors={CHUNITHM_WORLDS_END_GRADIENT}
        end={{ x: 1, y: 0.5 }}
        start={{ x: 0, y: 0.5 }}
        style={styles.badge}
        testID="chunithm-worlds-end-badge"
      >
        <View pointerEvents="none" style={styles.worldsEndOverlay} />
        <Text numberOfLines={1} style={[styles.text, { color: colors.text }]}>{text}</Text>
      </LinearGradient>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.badge,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <Text numberOfLines={1} style={[styles.text, { color: colors.text }]}>{text}</Text>
    </View>
  );
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
  },
  worldsEndOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,14,38,0.24)',
  },
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 0.25 },
});
