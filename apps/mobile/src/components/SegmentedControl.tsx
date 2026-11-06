import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export function SegmentedControl<T extends string>({ options, value, onChange, disabled = false, label, style }: {
  options: readonly { id: T; label: string; accessibilityLabel?: string }[];
  value: T; onChange: (id: T) => void; disabled?: boolean; label?: string; style?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  return <View accessibilityLabel={label} accessibilityRole="tablist" style={[styles.track, { backgroundColor: theme.surfaceMuted }, style]}>
    {options.map(option => {
      const selected = value === option.id;
      return <Pressable key={option.id} accessibilityRole="tab" accessibilityLabel={option.accessibilityLabel ?? option.label}
        disabled={disabled} accessibilityState={{ selected, disabled }} onPress={() => onChange(option.id)}
        style={({ pressed }) => [styles.option, selected && { backgroundColor: theme.surface }, (pressed || disabled) && styles.dim]}>
        <Text style={[styles.text, { color: selected ? theme.accent : theme.textSecondary }]}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, borderRadius: 14, gap: 3 },
  option: { flex: 1, minHeight: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  dim: { opacity: 0.6 },
});
