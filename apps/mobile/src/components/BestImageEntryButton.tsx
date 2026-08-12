import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useAppTheme } from '@/theme/app-theme';

export function BestImageEntryButton({
  label,
  accessibilityLabel = label,
  testID,
}: {
  label: string;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const theme = useAppTheme();
  return <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" onPress={() => router.push('/best-image')}
    style={[styles.button, { backgroundColor: theme.accent }]} testID={testID}>
    <Text style={styles.text}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 46, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#246BFD' },
  text: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
