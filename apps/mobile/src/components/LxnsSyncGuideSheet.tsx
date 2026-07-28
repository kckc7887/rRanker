import { useState, type ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '@/components/AppModal';
import { useNotification } from '@/components/AppNotification';
import { useAppTheme } from '@/theme/app-theme';

export const LXNS_PROXY_SERVER = 'proxy.maimai.lxns.net';
export const LXNS_PROXY_PORT = '8080';
export const LXNS_PROXY_ADDRESS = `${LXNS_PROXY_SERVER}:${LXNS_PROXY_PORT}`;

export function LxnsSyncGuideSheet({
  visible,
  syncing,
  gameName,
  shortGameName,
  offlineSyncUrl,
  testID,
  isMaintenanceWindow,
  maintenanceMessage,
  beforeSteps,
  syncDisabled = false,
  syncButtonLabel = '同步数据',
  syncBusyLabel = '同步中…',
  syncHint = '落雪咖啡屋',
  onClose,
  onSync,
}: {
  visible: boolean;
  syncing: boolean;
  gameName: string;
  shortGameName: string;
  offlineSyncUrl: string;
  testID: string;
  isMaintenanceWindow: () => boolean;
  maintenanceMessage: string;
  beforeSteps?: ReactNode;
  syncDisabled?: boolean;
  syncButtonLabel?: string;
  syncBusyLabel?: string;
  syncHint?: string;
  onClose: () => void;
  onSync: () => Promise<boolean>;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  return (
    <AppModal
      animationType="slide"
      onRequestClose={syncing ? undefined : onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View
        style={[
          styles.root,
          { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, 12) },
        ]}
        testID={testID}
      >
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>上传{gameName}数据</Text>
          <Pressable
            accessibilityLabel={`关闭${shortGameName}同步引导`}
            accessibilityRole="button"
            disabled={syncing}
            onPress={onClose}
            style={({ pressed }) => [styles.closeHit, pressed && styles.pressed, syncing && styles.disabled]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>关闭</Text>
          </Pressable>
        </View>

        <LxnsSyncGuideContent
          syncing={syncing}
          shortGameName={shortGameName}
          offlineSyncUrl={offlineSyncUrl}
          isMaintenanceWindow={isMaintenanceWindow}
          maintenanceMessage={maintenanceMessage}
          beforeSteps={beforeSteps}
          syncDisabled={syncDisabled}
          syncButtonLabel={syncButtonLabel}
          syncBusyLabel={syncBusyLabel}
          syncHint={syncHint}
          onClose={onClose}
          onSync={onSync}
        />
      </View>
    </AppModal>
  );
}

export function LxnsSyncGuideContent({
  syncing,
  shortGameName,
  offlineSyncUrl,
  isMaintenanceWindow,
  maintenanceMessage,
  beforeSteps,
  syncDisabled = false,
  syncButtonLabel = '同步数据',
  syncBusyLabel = '同步中…',
  syncHint = '落雪咖啡屋',
  onClose,
  onSync,
}: {
  syncing: boolean;
  shortGameName: string;
  offlineSyncUrl: string;
  isMaintenanceWindow: () => boolean;
  maintenanceMessage: string;
  beforeSteps?: ReactNode;
  syncDisabled?: boolean;
  syncButtonLabel?: string;
  syncBusyLabel?: string;
  syncHint?: string;
  onClose: () => void;
  onSync: () => Promise<boolean>;
}) {
  const theme = useAppTheme();
  const { showNotification } = useNotification();
  const [submitting, setSubmitting] = useState(false);
  const busy = syncing || submitting;

  const copy = async (label: string, value: string) => {
    if (isMaintenanceWindow()) {
      showNotification({
        title: '游戏服务器维护中',
        message: maintenanceMessage,
        variant: 'warning',
      });
      return;
    }
    try {
      await Clipboard.setStringAsync(value);
      showNotification({
        title: '已复制',
        message: `${label}已复制到剪贴板`,
        variant: 'success',
      });
    } catch {
      showNotification({
        title: '复制失败',
        message: `无法复制${label}，请稍后重试`,
        variant: 'error',
      });
    }
  };

  const sync = async () => {
    if (busy || syncDisabled) return;
    setSubmitting(true);
    try {
      if (await onSync()) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            请按以下步骤通过落雪离线同步，再返回应用读取成绩。离线同步仅更新已经与落雪账号绑定的玩家数据。
          </Text>

          {beforeSteps}

          <GuideStep number="1" title="配置 HTTP 代理">
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              在系统、Wi-Fi 或 APN 设置中挂载以下 HTTP 代理。同步结束后必须关闭代理。
            </Text>
            <CopyRow
              label="服务器"
              value={LXNS_PROXY_SERVER}
              onCopy={() => void copy('代理服务器', LXNS_PROXY_SERVER)}
            />
            <CopyRow
              label="端口"
              value={LXNS_PROXY_PORT}
              onCopy={() => void copy('代理端口', LXNS_PROXY_PORT)}
            />
            <CopyRow
              label="完整地址"
              value={LXNS_PROXY_ADDRESS}
              onCopy={() => void copy('代理完整地址', LXNS_PROXY_ADDRESS)}
            />
          </GuideStep>

          <GuideStep number="2" title="在微信中打开离线同步链接">
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              将链接发送到安全的微信聊天（如文件传输助手），再从聊天消息中点击。不要把链接粘贴到搜索框。
            </Text>
            <View style={[styles.linkBox, { backgroundColor: theme.input, borderColor: theme.border }]}>
              <Text selectable style={[styles.link, { color: theme.textSecondary }]}>
                {offlineSyncUrl}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`复制${shortGameName}离线同步链接`}
              accessibilityRole="button"
              onPress={() => void copy(`${shortGameName}离线同步链接`, offlineSyncUrl)}
              style={({ pressed }) => [
                styles.copyWide,
                { borderColor: theme.accent, backgroundColor: theme.surface },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.copyText, { color: theme.accent }]}>复制离线同步链接</Text>
            </Pressable>
          </GuideStep>

          <GuideStep number="3" title="关闭代理并同步数据">
            <View style={[styles.warning, { backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.warningText, { color: theme.warning }]}>
                微信显示玩家数据已经上传后，成绩仍可能继续在服务器处理。请等待处理完成，先关闭 HTTP 代理，再点击下方按钮。
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`从同步引导同步${shortGameName}数据`}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || syncDisabled }}
              disabled={busy || syncDisabled}
              onPress={() => void sync()}
              style={({ pressed }) => [
                styles.sync,
                { backgroundColor: theme.accent },
                pressed && !busy && !syncDisabled && styles.pressed,
                (busy || syncDisabled) && styles.disabled,
              ]}
            >
              <Text style={styles.syncText}>{busy ? syncBusyLabel : syncButtonLabel}</Text>
              <Text style={styles.syncHint}>{syncHint}</Text>
            </Pressable>
          </GuideStep>
    </ScrollView>
  );
}

function GuideStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.step, { backgroundColor: theme.surface }]}>
      <View style={styles.stepTitleRow}>
        <View style={[styles.number, { backgroundColor: theme.accent }]}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <Text style={[styles.stepTitle, { color: theme.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function CopyRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.copyRow, { backgroundColor: theme.input, borderColor: theme.border }]}>
      <View style={styles.copyBody}>
        <Text style={[styles.copyLabel, { color: theme.textMuted }]}>{label}</Text>
        <Text selectable style={[styles.copyValue, { color: theme.text }]}>{value}</Text>
      </View>
      <Pressable
        accessibilityLabel={`复制${label}`}
        accessibilityRole="button"
        onPress={onCopy}
        style={({ pressed }) => [
          styles.copyButton,
          { borderColor: theme.accent, backgroundColor: theme.surface },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.copyText, { color: theme.accent }]}>复制</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    minHeight: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 18, fontWeight: '800' },
  closeHit: { paddingHorizontal: 4, paddingVertical: 8 },
  close: { fontSize: 16, fontWeight: '700' },
  content: { paddingHorizontal: 20, gap: 14 },
  intro: { fontSize: 13, lineHeight: 20 },
  step: { borderRadius: 16, padding: 16, gap: 11 },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  number: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numberText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  stepTitle: { fontSize: 16, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19 },
  copyRow: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyBody: { flex: 1, gap: 2 },
  copyLabel: { fontSize: 11, fontWeight: '700' },
  copyValue: { fontSize: 14, fontWeight: '700' },
  copyButton: {
    minWidth: 54,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  copyWide: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyText: { fontSize: 13, fontWeight: '800' },
  linkBox: { borderWidth: 1, borderRadius: 12, padding: 12 },
  link: { fontSize: 12, lineHeight: 18 },
  warning: { borderRadius: 12, padding: 12 },
  warningText: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sync: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  syncText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  syncHint: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.55 },
});
