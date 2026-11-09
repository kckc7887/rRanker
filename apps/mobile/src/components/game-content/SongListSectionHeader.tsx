import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

export function SongListSectionHeader({ title, value }: { title: string; value: string | number }) {
  const theme = useAppTheme();
  return <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{value}</Text>
  </View>;
}

const styles = StyleSheet.create({
  sectionHeader: { marginTop: 10, marginBottom: 2, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionCount: { fontSize: 11 },
});
