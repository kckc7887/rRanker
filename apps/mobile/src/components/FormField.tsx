import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export function FormField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const theme = useAppTheme();
  return <View style={styles.field}><Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text><TextInput accessibilityLabel={label} autoCorrect={false}
    value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.textMuted}
    style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]} /></View>;
}
const styles = StyleSheet.create({ field: { gap: 4, flex: 1 }, label: { color: '#4B5563', fontSize: 12 }, input: { backgroundColor: '#FFF', borderColor: '#D1D5DB', borderWidth: 1, borderRadius: 9, padding: 10, color: '#111827' } });
