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
};

export function ChunithmDifficultyBadge({
  levelIndex,
  level,
  constant,
}: {
  levelIndex: ChunithmLevelIndex;
  level?: string;
  constant?: number;
}) {
  const colors = DIFFICULTY_THEME[levelIndex];
  const label = CHUNITHM_DIFFICULTY_LABELS[levelIndex];
  const constantText = constant === undefined ? '—' : constant.toFixed(1);
  return (
    <View
      accessibilityLabel={`${label}，标级 ${level ?? '未知'}，定数 ${constantText}`}
      style={[
        styles.badge,
        { backgroundColor: colors.background, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{constantText}</Text>
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
  text: { fontSize: 9, fontWeight: '900', letterSpacing: 0.25 },
});
