import { SettingsRow } from '@/components/SettingsRow';
import { useEffect } from 'react';
import { Stack, router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, Switch } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { DetailGestureRoot } from '@/components/game-content/DetailPressable';
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
      <SettingsRow title="启用示例账号与示例游戏" detail="开启后可添加和使用示例账号与示例游戏，关闭后隐藏，已有数据保留">
        <Switch
          accessibilityLabel="启用示例账号与示例游戏"
          value={hydrated && enabled}
          disabled={!hydrated || saving}
          trackColor={{ false: theme.border, true: theme.accentSoft }}
          thumbColor={enabled ? theme.accent : theme.surface}
          onValueChange={(value) => void setEnabled(value).catch(() => showNotification({
            title: '保存失败', message: '暂时无法更改示例设置，请重试。', variant: 'error',
          }))}
        />
      </SettingsRow>
      <SettingsRow title="诊断" detail="记录与分享日志，协助排查问题" onPress={() => router.push('/diagnostics' as Href)} />
    </ScrollView>
  </DetailGestureRoot>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, gap: 12 },
});
