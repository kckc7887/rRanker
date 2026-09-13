import { useEffect } from 'react';
import { Stack, router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { useDebugStore } from '@/state/debug-store';
import { useAppTheme } from '@/theme/app-theme';

export default function DebugScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const enabled = useDebugStore((state) => state.testAccountsEnabled);
  const hydrated = useDebugStore((state) => state.hydrated);
  const saving = useDebugStore((state) => state.saving);
  const hydrate = useDebugStore((state) => state.hydrate);
  const setEnabled = useDebugStore((state) => state.setTestAccountsEnabled);

  useEffect(() => { void hydrate().catch(() => undefined); }, [hydrate]);

  return <DetailGestureRoot style={[styles.page, { backgroundColor: theme.background }]}>
    <Stack.Screen options={{ title: '调试' }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={[styles.row, { backgroundColor: theme.surface }]}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>启用测试账号</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>开启后可添加示例查分器，关闭不影响已添加的账号</Text>
        </View>
        <Switch
          accessibilityLabel="启用测试账号"
          value={hydrated && enabled}
          disabled={!hydrated || saving}
          trackColor={{ false: theme.border, true: theme.accentSoft }}
          thumbColor={enabled ? theme.accent : theme.surface}
          onValueChange={(value) => void setEnabled(value).catch(() => showNotification({
            title: '保存失败', message: '暂时无法更改测试账号设置，请重试。', variant: 'error',
          }))}
        />
      </View>
      <DetailPressable accessibilityRole="button" accessibilityLabel="诊断"
        onPress={() => router.push('/diagnostics' as Href)}
        style={[styles.row, { backgroundColor: theme.surface }]}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>诊断</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>记录与分享日志，协助排查问题</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text>
      </DetailPressable>
    </ScrollView>
  </DetailGestureRoot>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
  row: { paddingHorizontal: 18, paddingVertical: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  detail: { fontSize: 13, lineHeight: 18 },
  chevron: { fontSize: 28, lineHeight: 28, fontWeight: '300' },
});
