import { StyleSheet, Text, View } from 'react-native';
import { phigrosLevelColors, phigrosLevelLabel } from '@/domain/phigros-level-theme';

export function PhigrosDifficultyBadge({
  levelIndex,
  constant,
  showLabel = true,
  showConstant = true,
}: {
  levelIndex: number;
  constant: number;
  showLabel?: boolean;
  showConstant?: boolean;
}) {
  const colors = phigrosLevelColors(levelIndex);
  const label = phigrosLevelLabel(levelIndex);

  return (
    <View
      accessibilityLabel={`${label}，定数 ${constant.toFixed(1)}`}
      style={[styles.badge, { backgroundColor: colors.bg }]}
    >
      {showLabel ? <Text style={[styles.label, { color: colors.fg }]}>{label}</Text> : null}
      {showConstant ? (
        <Text style={[
          styles.constant,
          !showLabel && styles.constantOnly,
          { color: colors.fg },
        ]}>
          {constant.toFixed(1)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  constant: { fontSize: 9, fontWeight: '700', opacity: 0.7 },
  constantOnly: { fontWeight: '800', opacity: 1 },
});
