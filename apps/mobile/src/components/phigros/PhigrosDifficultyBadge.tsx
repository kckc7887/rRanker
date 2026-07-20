import { StyleSheet, Text, View } from 'react-native';

const LEVEL_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#E6F5ED', fg: '#3E9D6B' },
  1: { bg: '#E8F0FE', fg: '#3B82F6' },
  2: { bg: '#FDE8EC', fg: '#D84B68' },
  3: { bg: '#F3F4F6', fg: '#374151' },
};

const LEVEL_LABELS: Record<number, string> = {
  0: 'EZ',
  1: 'HD',
  2: 'IN',
  3: 'AT',
};

export function PhigrosDifficultyBadge({ levelIndex, constant }: { levelIndex: number; constant: number }) {
  const colors = LEVEL_COLORS[levelIndex] ?? { bg: '#F3F4F6', fg: '#6B7280' };
  const label = LEVEL_LABELS[levelIndex] ?? `LV${levelIndex}`;
  const text = constant.toFixed(1);

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.fg }]}>{label}</Text>
      <Text style={[styles.constant, { color: colors.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  constant: { fontSize: 9, fontWeight: '700', opacity: 0.7 },
});
