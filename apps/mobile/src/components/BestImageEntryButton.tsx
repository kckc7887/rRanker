import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '@/theme/app-theme';

export function BestImageEntryButton({ label }: { label: string }) {
  const theme = useAppTheme();
  return <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={() => router.push('/best-image')}
    style={({ pressed }) => [styles.button, { backgroundColor: theme.accentSoft, borderColor: theme.accent }, pressed && styles.pressed]}>
    <Ionicons color={theme.accent} name="image-outline" size={18} />
    <Text style={[styles.text, { color: theme.accent }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, marginBottom: 9, borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { fontSize: 13, fontWeight: '800' }, pressed: { opacity: 0.7 },
});
