import { StyleSheet, Text, TextInput, View } from 'react-native';

export function FormField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCorrect={false}
    value={value} onChangeText={onChangeText} placeholder={placeholder} style={styles.input} /></View>;
}
const styles = StyleSheet.create({ field: { gap: 4, flex: 1 }, label: { color: '#4B5563', fontSize: 12 }, input: { backgroundColor: '#FFF', borderColor: '#D1D5DB', borderWidth: 1, borderRadius: 9, padding: 10, color: '#111827' } });
