import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNotification } from '@/components/AppNotification';
import { DetailGestureRoot, DetailPressable } from '@/components/game-content/DetailPressable';
import { RUNTIME_LOG_CAPACITIES, type RuntimeLogStatus } from '@/domain/runtime-log';
import { exportRuntimeDiagnostics } from '@/services/runtime-diagnostics';
import { initializeRuntimeLogs, runtimeLogs, shareRuntimeLog } from '@/services/runtime-logs';
import { useAppTheme } from '@/theme/app-theme';

const statusText: Record<RuntimeLogStatus, string> = {
  recording: '正在记录', stopped: '已结束', interrupted: '已中断', failed: '保存失败',
};

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function DiagnosticsScreen() {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const state = useSyncExternalStore(runtimeLogs.subscribe, runtimeLogs.getSnapshot);
  const [action, setAction] = useState<string | null>(null);
  const actionPending = useRef(false);
  const disabled = state.busy || action !== null;
  const capacityDisabled = state.enabled || !state.ready || disabled;
  const recording = state.activeId !== null && state.sessions.some((session) => session.id === state.activeId && session.status === 'recording');
  const preparing = state.busy || (!state.ready && !state.failed);
  const controlStatus = preparing ? '准备中' : state.failed ? '保存失败' : recording ? '正在记录' : state.enabled ? '等待记录' : '未开启';
  const controlColor = preparing ? theme.textSecondary : state.failed ? theme.danger : recording ? theme.accent : theme.textSecondary;
  const statusColors: Record<RuntimeLogStatus, string> = {
    recording: theme.accent, stopped: theme.textSecondary, interrupted: theme.warning, failed: theme.danger,
  };
  useEffect(() => { void initializeRuntimeLogs().catch(() => undefined); }, []);

  const perform = async (key: string, task: () => void | Promise<void>, message: string) => {
    if (actionPending.current || runtimeLogs.getSnapshot().busy) return;
    actionPending.current = true;
    setAction(key);
    try { await task(); } catch {
      showNotification({ title: '操作失败', message, variant: 'error' });
    } finally {
      actionPending.current = false;
      setAction(null);
    }
  };
  const button = (key: string, title: string, task: () => void | Promise<void>, message: string, accessibilityLabel = title) => (
    <DetailPressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, busy: action === key }} disabled={disabled}
      onPress={() => void perform(key, task, message)}
      style={[styles.button, { backgroundColor: theme.accentSoft, opacity: disabled && action !== key ? 0.5 : 1 }]}
    >
      {action === key ? <ActivityIndicator color={theme.accent} /> : null}
      <Text style={[styles.buttonText, { color: theme.accent }]}>{title}</Text>
    </DetailPressable>
  );

  return <>
    <Stack.Screen options={{ title: '诊断' }} />
    <DetailGestureRoot style={styles.page}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={[styles.page, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
        <View style={[styles.section, { backgroundColor: theme.surface }]}>
          <View style={styles.switchRow}>
            <View style={styles.controlText}>
              <Text style={[styles.title, { color: theme.text }]}>记录日志</Text>
              <View style={styles.statusRow} accessibilityLiveRegion="polite">
                {preparing ? <ActivityIndicator size="small" color={theme.accent} /> : <View style={[styles.statusDot, { backgroundColor: controlColor }]} />}
                <Text style={[styles.statusText, { color: controlColor }]}>{controlStatus}</Text>
              </View>
            </View>
            <Switch
              accessibilityLabel="记录日志" value={state.enabled} disabled={!state.ready || disabled}
              trackColor={{ false: theme.border, true: theme.accentSoft }}
              thumbColor={state.enabled ? theme.accent : theme.surface}
              onValueChange={(enabled) => void perform('toggle', () => enabled ? runtimeLogs.start() : runtimeLogs.stop(), '暂时无法更改记录状态，请重试。')}
            />
          </View>
          <Text style={[styles.body, { color: theme.textSecondary }]}>开启后重现遇到的问题，再分享日志协助排查。</Text>
          <Text style={[styles.detail, { color: theme.textMuted }]}>每次启动会新建日志，直到手动关闭记录。</Text>
          <View style={[styles.capacityGroup, { borderTopColor: theme.border }]}>
            <View style={styles.wrapRow}>
              <Text style={[styles.label, { color: theme.text }]}>每份保留条数</Text>
              {state.enabled ? <Text style={[styles.detail, { color: theme.textMuted }]}>关闭记录后可调整</Text> : null}
            </View>
            <View style={[styles.choices, { backgroundColor: theme.surfaceMuted }]}>
              {RUNTIME_LOG_CAPACITIES.map((capacity) => <DetailPressable
                key={capacity} accessibilityRole="radio" accessibilityLabel={`保留 ${capacity} 条`}
                accessibilityState={{ checked: state.capacity === capacity, disabled: capacityDisabled }} disabled={capacityDisabled}
                onPress={() => void perform('capacity', () => runtimeLogs.setCapacity(capacity), '暂时无法保存条数选择，请重试。')}
                style={[styles.choice, {
                  backgroundColor: state.capacity === capacity ? theme.accentSoft : 'transparent',
                  borderColor: state.capacity === capacity ? theme.accent : 'transparent',
                  opacity: capacityDisabled ? 0.6 : 1,
                }]}
              >
                <Text style={[styles.buttonText, { color: state.capacity === capacity ? theme.accent : theme.textSecondary }]}>{capacity} 条</Text>
              </DetailPressable>)}
            </View>
            <Text style={[styles.detail, { color: theme.textMuted }]}>每份保留最近的记录，最多保存两份日志。</Text>
          </View>
          {state.failed && !preparing ? <View style={[styles.failure, { backgroundColor: theme.dangerSoft }]}>
            <Text style={[styles.body, { color: theme.danger }]}>{state.ready ? '日志保存遇到问题，请重试。' : '暂时无法读取日志，请重试。'}</Text>
            {button('retry', '重试', () => state.ready ? runtimeLogs.start() : initializeRuntimeLogs(), '暂时无法开始记录，请稍后重试。')}
          </View> : null}
        </View>

        <View style={styles.listHeading}>
          <Text style={[styles.title, { color: theme.text }]}>最近日志</Text>
          {state.sessions.length > 0 ? <Text style={[styles.detail, { color: theme.textMuted }]}>分享时会附带诊断信息</Text> : null}
        </View>
        {state.ready && !state.failed && !preparing && state.sessions.length === 0 ? <View style={[styles.section, styles.empty, { backgroundColor: theme.surface }]}>
          <Text style={[styles.title, styles.centerText, { color: theme.text }]}>还没有日志</Text>
          <Text style={[styles.body, styles.centerText, { color: theme.textSecondary }]}>开启记录后重现问题，就可以在这里分享日志。</Text>
          <Text style={[styles.detail, styles.centerText, { color: theme.textMuted }]}>未提前开启记录，也可以分享诊断信息协助排查。</Text>
          {button('export', '分享诊断信息', exportRuntimeDiagnostics, '暂时无法分享诊断信息，请稍后重试。')}
        </View> : null}
        {state.sessions.map((session, index) => {
          const name = index === 0 ? '最新记录' : '上次记录';
          return <View key={session.id} style={[styles.section, styles.logCard, { backgroundColor: theme.surface, borderColor: index === 0 ? theme.accent : theme.border }]}>
            <View style={styles.wrapRow}>
              <Text style={[styles.title, { color: index === 0 ? theme.accent : theme.text }]}>{name}</Text>
              <View style={[styles.badge, { backgroundColor: session.status === 'recording' ? theme.accentSoft : session.status === 'failed' ? theme.dangerSoft : theme.surfaceMuted }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColors[session.status] }]} />
                <Text style={[styles.statusText, { color: statusColors[session.status] }]}>{statusText[session.status]}</Text>
              </View>
            </View>
            <View style={styles.times}>
              <View style={styles.wrapRow}>
                <Text style={[styles.detail, { color: theme.textMuted }]}>开始时间</Text>
                <Text style={[styles.time, { color: theme.text }]}>{formatLogTime(session.startedAt)}</Text>
              </View>
              <View style={styles.wrapRow}>
                <Text style={[styles.detail, { color: theme.textMuted }]}>最后记录</Text>
                <Text style={[styles.time, { color: theme.text }]}>{formatLogTime(session.lastAt)}</Text>
              </View>
            </View>
            <View style={[styles.logFooter, { borderTopColor: theme.border }]}>
              <Text style={[styles.detail, { color: theme.textSecondary }]}>已保留 {session.count} 条 · 上限 {session.capacity} 条</Text>
              {button(`share-${session.id}`, '分享日志', () => shareRuntimeLog(session.id), '暂时无法分享这份日志，请重试。', `分享日志，${name}，${formatLogTime(session.startedAt)}`)}
            </View>
          </View>;
        })}
      </ScrollView>
    </DetailGestureRoot>
  </>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  section: { borderRadius: 14, padding: 16, gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  controlText: { flex: 1, gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 13, lineHeight: 18, fontWeight: '600', flexShrink: 1 },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 21 },
  detail: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  capacityGroup: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 10 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 6 },
  choices: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 4 },
  choice: { flex: 1, minHeight: 44, paddingHorizontal: 4, paddingVertical: 10, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  failure: { borderRadius: 10, padding: 12, gap: 10 },
  listHeading: { gap: 4, paddingTop: 8, paddingHorizontal: 2 },
  empty: { paddingVertical: 24, gap: 12 },
  centerText: { textAlign: 'center' },
  logCard: { borderWidth: 1, gap: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, maxWidth: '100%' },
  times: { gap: 10 },
  time: { fontSize: 14, lineHeight: 21, fontVariant: ['tabular-nums'], flexShrink: 1 },
  logFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 12 },
});
