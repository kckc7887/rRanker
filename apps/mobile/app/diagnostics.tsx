import { useEffect, useState, useSyncExternalStore } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { RUNTIME_LOG_CAPACITIES, type RuntimeLogStatus } from '@/domain/runtime-log';
import { exportRuntimeDiagnostics } from '@/services/runtime-diagnostics';
import { initializeRuntimeLogs, runtimeLogs, shareRuntimeLog } from '@/services/runtime-logs';
import { useAppTheme } from '@/theme/app-theme';

const statusText: Record<RuntimeLogStatus, string> = {
  recording: '记录中', stopped: '已结束', interrupted: '已中断', failed: '保存失败',
};

export default function DiagnosticsScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const state = useSyncExternalStore(runtimeLogs.subscribe, runtimeLogs.getSnapshot);
  const [action, setAction] = useState<string | null>(null);
  const active = state.activeId !== null;
  useEffect(() => { void initializeRuntimeLogs().catch(() => undefined); }, []);

  const perform = async (key: string, task: () => void | Promise<void>, message: string) => {
    if (action) return;
    setAction(key);
    try { await task(); } catch {
      showNotification({ title: '操作失败', message, variant: 'error' });
    } finally { setAction(null); }
  };
  const button = (key: string, title: string, task: () => void | Promise<void>, message: string, accessibilityLabel = title) => (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={action !== null || state.busy}
      onPress={() => void perform(key, task, message)}
      style={[styles.button, { backgroundColor: theme.accentSoft }]}>
      {action === key ? <ActivityIndicator color={theme.accent} /> : null}
      <Text style={{ color: theme.accent, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );

  return <>
    <Stack.Screen options={{ title: '诊断' }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: theme.text }]}>记录日志</Text>
          <Switch accessibilityLabel="记录日志" value={active} disabled={!state.ready || state.busy || action !== null}
            onValueChange={(enabled) => void perform('toggle', () => enabled ? runtimeLogs.start() : runtimeLogs.stop(), '暂时无法更改记录状态，请重试。')} />
        </View>
        <Text style={{ color: theme.textMuted }}>开启后重现问题，再分享对应日志。重启应用后会停止记录。</Text>
        <Text style={{ color: theme.text }}>每份日志保留条数</Text>
        <View style={styles.row}>
          {RUNTIME_LOG_CAPACITIES.map((capacity) => <Pressable key={capacity} accessibilityRole="radio" accessibilityLabel={`保留 ${capacity} 条`}
            accessibilityState={{ checked: state.capacity === capacity, disabled: active || state.busy || !state.ready || action !== null }}
            disabled={active || state.busy || !state.ready || action !== null}
            onPress={() => void perform('capacity', () => runtimeLogs.setCapacity(capacity), '暂时无法保存条数选择，请重试。')}
            style={[styles.choice, { borderColor: state.capacity === capacity ? theme.accent : theme.border, opacity: active ? 0.5 : 1 }]}>
            <Text style={{ color: state.capacity === capacity ? theme.accent : theme.text }}>{capacity} 条</Text>
          </Pressable>)}
        </View>
        <Text style={{ color: theme.textMuted }}>超过条数后替换最早的日志。日志库保留最近两份记录。</Text>
        {state.busy ? <ActivityIndicator accessibilityLabel="正在准备日志" color={theme.accent} /> : null}
        {state.failed ? <>
          <Text style={{ color: theme.text }}>日志保存遇到问题，记录已停止。请重试。</Text>
          {button('retry', '重试', () => state.ready ? runtimeLogs.start() : initializeRuntimeLogs(), '暂时无法开始记录，请稍后重试。')}
        </> : null}
      </View>
      <Text style={[styles.title, { color: theme.text }]}>日志记录</Text>
      {state.ready && state.sessions.length === 0 ? <Text style={{ color: theme.textMuted }}>暂无日志，请先开启记录。</Text> : null}
      {state.sessions.map((session) => <View key={session.id} style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={{ color: theme.text }}>开始时间：{new Date(session.startedAt).toLocaleString()}</Text>
        <Text style={{ color: theme.textMuted }}>最后记录：{new Date(session.lastAt).toLocaleString()}</Text>
        <Text style={{ color: theme.text }}>{statusText[session.status]} · {session.count} / {session.capacity} 条</Text>
        {button(`share-${session.id}`, '分享', () => shareRuntimeLog(session.id), '暂时无法分享这份日志，请重试。', `分享日志 ${new Date(session.startedAt).toLocaleString()} #${session.id}`)}
      </View>)}
      <View style={[styles.section, { backgroundColor: theme.surface }]}>
        <Text style={{ color: theme.textMuted }}>遇到闪退或功能异常时，可导出记录并发送给开发者协助排查</Text>
        {button('export', '导出诊断记录', exportRuntimeDiagnostics, '暂时无法导出诊断记录，请稍后重试。')}
      </View>
    </ScrollView>
  </>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  section: { borderRadius: 14, padding: 18, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  button: { padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  choice: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: 10 },
});
