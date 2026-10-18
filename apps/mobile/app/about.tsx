import { Stack, router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { useAppTheme } from '@/theme/app-theme';

export default function AboutScreen() {
  const theme = useAppTheme();

  return (
    <DetailGestureRoot style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '关于' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <DetailPressable
          onPress={() => router.push('/privacy-policy' as Href)}
          style={[styles.row, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.title, { color: theme.text }]}>隐私政策</Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </DetailPressable>
      </ScrollView>
    </DetailGestureRoot>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  row: { paddingHorizontal: 18, paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  chevron: { fontSize: 28, lineHeight: 28, fontWeight: '300' },
});
