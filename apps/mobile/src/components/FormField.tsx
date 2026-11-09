import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

type FormFieldProps = Pick<TextInputProps, 'placeholder' | 'keyboardType' | 'accessibilityLabel'> & {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string | null;
};

export function FormField({ label, value, onChangeText, error, accessibilityLabel, ...input }: FormFieldProps) {
  const theme = useAppTheme();
  return <View style={styles.field}>
    <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
    <TextInput {...input} accessibilityLabel={accessibilityLabel ?? label} autoCorrect={false}
      value={value} onChangeText={onChangeText} placeholderTextColor={theme.textMuted}
      style={[styles.input, { backgroundColor: theme.input, borderColor: error ? theme.danger : theme.border, color: theme.text }]} />
    {error && <Text style={{ color: theme.danger }}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 4, flex: 1 },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 9, padding: 10 },
});
