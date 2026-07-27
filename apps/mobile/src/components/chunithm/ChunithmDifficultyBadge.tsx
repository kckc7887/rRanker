import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import {
  CHUNITHM_DIFFICULTY_LABELS,
  type ChunithmLevelIndex,
} from '@/domain/chunithm';

const DIFFICULTY_THEME: Record<ChunithmLevelIndex, {
  background: string;
  border: string;
  text: string;
}> = {
  0: { background: '#4AA58A', border: '#4AA58A', text: '#FFFFFF' },
  1: { background: '#E27A24', border: '#E27A24', text: '#FFFFFF' },
  2: { background: '#D6403A', border: '#D6403A', text: '#FFFFFF' },
  3: { background: '#7526CF', border: '#7526CF', text: '#FFFFFF' },
  4: { background: '#17171A', border: '#E83A58', text: '#FFFFFF' },
  5: { background: '#7B61FF', border: '#F24FD4', text: '#FFFFFF' },
};

export const CHUNITHM_WORLDS_END_GRADIENT = [
  '#37E6FF', '#7B61FF', '#F24FD4', '#FF8A3D',
] as const;

export type ChunithmDifficultyBadgeDisplay = 'constant' | 'label-and-value';

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
  const colors = DIFFICULTY_THEME[levelIndex];
  const label = CHUNITHM_DIFFICULTY_LABELS[levelIndex];
  const constantText = constant === undefined ? '—' : constant.toFixed(1);
  const valueText = levelIndex === 5 ? (worldsEndLabel?.trim() || '—') : constantText;
  const text = display === 'label-and-value' ? `${label} (${valueText})` : valueText;
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
