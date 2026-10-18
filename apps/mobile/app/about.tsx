import Constants from 'expo-constants';
import { Stack, router, type Href } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { useAppTheme } from '@/theme/app-theme';

export default function AboutScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const appVersion = Constants.expoConfig?.version ?? '未知';

  const handleOpenRepository = async () => {
    try {
      await Linking.openURL('https://github.com/kckc7887/rRanker');
    } catch (error) {
      recordRuntimeError('github-repository-open', error);
      showNotification({
        title: '打开失败',
        message: '无法打开 GitHub 仓库，请检查浏览器后重试。',
        variant: 'error',
      });
    }
  };

  return (
    <DetailGestureRoot style={[styles.page, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '关于' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={[styles.row, { backgroundColor: theme.surface }]}>
          <Text style={[styles.title, { flex: 1, color: theme.text }]}>版本信息</Text>
          <Text style={[styles.value, { color: theme.textSecondary }]}>{appVersion}</Text>
        </View>
        <DetailPressable
          onPress={() => router.push('/privacy-policy' as Href)}
          style={[styles.row, { backgroundColor: theme.surface }]}
        >
          <Text style={[styles.title, { flex: 1, color: theme.text }]}>隐私政策</Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
        </DetailPressable>
        <DetailPressable
          onPress={() => void handleOpenRepository()}
          style={[styles.row, { backgroundColor: theme.surface }]}
        >
          <View style={styles.copy}>
            <Text style={[styles.title, { color: theme.text }]}>GitHub 仓库</Text>
            <Text style={[styles.detail, { color: theme.textMuted }]}>kckc7887/rRanker</Text>
          </View>
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
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  value: { flexShrink: 1, fontSize: 15 },
  detail: { fontSize: 13, lineHeight: 18 },
  chevron: { fontSize: 28, lineHeight: 28, fontWeight: '300' },
});
