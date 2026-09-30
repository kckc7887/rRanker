import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { createPhigrosBoundAccount } from '@/domain/bound-account';
import { ProviderError, providerErrorToUserMessage } from '@/providers/errors';
import { PhigrosScoreProvider, type DeviceCodeResult } from '@/providers/phigros-score-provider';
import { SecureSessionStore } from '@/storage/secure-session-store';
import {
  getAppLifecycleSnapshot,
  getForegroundAbortSignal,
  useAppLifecycle,
} from '@/state/app-lifecycle';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';
import { useAccountBindingRequest } from '@/hooks/use-account-binding-flow';
import { captureResourceWrites } from '@/services/snapshot-cache-utils';
import { recordRuntimeError } from '@/services/runtime-diagnostics-recorder';

const sessions = new SecureSessionStore();
const QR_SIZE = 180;

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof ProviderError) {
    return error.code === 'network' || error.retryable;
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' || /network request failed/i.test(error.message);
  }
  return false;
}

async function openTapTapAuthorize(qrcodeUrl: string): Promise<void> {
  try {
    await Linking.openURL(
      `taptap://taptap.com/to?url=${encodeURIComponent(qrcodeUrl)}`,
    );
  } catch {
    await Linking.openURL(qrcodeUrl);
  }
}

export function PhigrosLoginPanel({
  visible,
  onSuccess,
  onBusyChange,
}: {
  visible: boolean;
  onSuccess: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const theme = useAppTheme();
  const setSession = useSession((s) => s.setSession);
  const lifecycle = useAppLifecycle();
  const requests = useAccountBindingRequest(visible, false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [phiDevice, setPhiDevice] = useState<DeviceCodeResult | null>(null);
  const [phiExpiresAt, setPhiExpiresAt] = useState(0);
  const phiDeviceRef = useRef(phiDevice);
  phiDeviceRef.current = phiDevice;
  const phiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phiNextAllowedAtRef = useRef(0);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (lifecycle.foregroundReady) setBusy(false);
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  const reset = () => {
    setMessage('');
    setBusy(false);
    setPhiDevice(null);
    phiDeviceRef.current = null;
    setPhiExpiresAt(0);
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    phiNextAllowedAtRef.current = 0;
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const messageFor = (error: unknown) => providerErrorToUserMessage(error, '验证失败，请稍后重试。');

  const invalidateAll = () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['score-snapshot'] }),
      queryClient.invalidateQueries({ queryKey: ['game-data'] }),
      queryClient.invalidateQueries({ queryKey: ['songs'] }),
    ]).catch(error => recordRuntimeError('phigros-binding', error, false, { phase: 'query-refresh' }));
  };

  const beginPhigrosLogin = async () => {
    const task = requests.begin(getForegroundAbortSignal());
    if (!task) return;
    setBusy(true);
    setMessage('正在请求 TapTap 授权…');
    const signal = task.signal;
    try {
      const device = await PhigrosScoreProvider.beginLogin(signal);
      task.assertCurrent();
      phiDeviceRef.current = device;
      setPhiDevice(device);
      setPhiExpiresAt(Date.now() + device.expiresIn * 1000);
      setMessage('请使用二维码或前往 TapTap 完成授权。');
    } catch (error) {
      if (!task.isCurrent()) return;
      setMessage(messageFor(error));
    } finally {
      if (task.isCurrent()) setBusy(false);
      task.finish();
    }
  };

  const pollPhigros = async () => {
    if (!phiDevice || phiDeviceRef.current !== phiDevice) return;
    if (!getAppLifecycleSnapshot().foregroundReady) return;
    const now = Date.now();
    if (now < phiNextAllowedAtRef.current) {
      setMessage('操作太频繁，请稍后再试。');
      return;
    }
    const task = requests.begin(getForegroundAbortSignal());
    if (!task) return;
    const assertGameCurrent = captureResourceWrites('phigros', task.signal);
    const assertCurrent = () => {
      task.assertCurrent(); assertGameCurrent();
      if (phiDeviceRef.current !== phiDevice || !getAppLifecycleSnapshot().foregroundReady) {
        throw Object.assign(new Error('绑定请求已取消'), { name: 'AbortError' });
      }
    };
    const remaining = Math.max(0, Math.floor((phiExpiresAt - now) / 1000));
    setMessage(`等待授权中…（${remaining} 秒后过期）`);
    const signal = task.signal;
    try {
      const result = await PhigrosScoreProvider.pollLogin(phiDevice, signal);
      assertCurrent();
      if (result === 'pending' || result === 'waiting') return;
      if (result === 'slowdown') {
        phiNextAllowedAtRef.current = Date.now() + 5_000;
        setMessage('操作太频繁，请稍后再试。');
        return;
      }
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      setMessage('正在保存并验证…');
      const newSession = result;
      if (newSession.mode !== 'phi-session') {
        setMessage('授权返回异常，请重试');
        return;
      }
      const account = createPhigrosBoundAccount({ playerId: newSession.playerId, rating: 0 });
      const assertAccountCurrent = captureResourceWrites('phigros', signal, account.id);
      assertCurrent(); assertAccountCurrent();
      await sessions.upsertAccount({
        id: account.id,
        gameId: 'phigros',
        providerId: 'phi-taptap',
        displayName: account.displayName,
        scoreDisplay: account.scoreDisplay,
        session: newSession,
      }, signal);
      assertCurrent(); assertAccountCurrent();
      setSession(newSession);
      invalidateAll();
      reset();
      onSuccess();
    } catch (error) {
      if (!task.isCurrent() || !getAppLifecycleSnapshot().foregroundReady) return;
      const expired = Date.now() >= phiExpiresAt;
      if (!expired && isTransientNetworkError(error)) {
        setMessage('网络波动，自动重试中…');
        return;
      }
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      setMessage(providerErrorToUserMessage(error, '授权失败，请重新尝试。'));
    } finally {
      task.finish();
    }
  };

  useEffect(() => {
    if (!phiDevice || !visible) return;
    const interval = phiDevice.interval * 1000;
    const stopPolling = () => {
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    };
    if (!lifecycle.foregroundReady) {
      stopPolling();
      return stopPolling;
    }
    stopPolling();
    void pollPhigros();
    phiTimer.current = setInterval(() => { void pollPhigros(); }, interval);
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 回调只在挂载时消费一次，或依赖已在上方说明
  }, [phiDevice, lifecycle.foregroundGeneration, lifecycle.foregroundReady, visible]);

  const cancelPhigrosLogin = () => {
    requests.cancel();
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    phiNextAllowedAtRef.current = 0;
    setPhiDevice(null);
    phiDeviceRef.current = null;
    setPhiExpiresAt(0);
    setMessage('');
    setBusy(false);
  };

  return (
    <>
      {!phiDevice && message ? <Text style={styles.message}>{message}</Text> : null}
      {!phiDevice ? (
        <>
          <Pressable
            disabled={busy}
            onPress={() => void beginPhigrosLogin()}
            style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>开始绑定</Text>
          </Pressable>
          <Text style={styles.hint}>
            点击后生成授权二维码，也可前往 TapTap 完成授权，授权成功后自动绑定。
          </Text>
        </>
      ) : (
        <>
          <View
            accessibilityLabel="TapTap 授权二维码"
            style={styles.phiQrWrap}
          >
            <QRCode
              value={phiDevice.qrcodeUrl}
              size={QR_SIZE}
              backgroundColor="#FFFFFF"
              color="#111111"
            />
          </View>
          <View style={styles.phiStatus}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
          </View>
          <Pressable
            onPress={() => {
              const device = phiDevice;
              void openTapTapAuthorize(device.qrcodeUrl).catch(error => {
                recordRuntimeError('phigros-binding', error, false, { phase: 'authorization-open' });
                if (phiDeviceRef.current === device && getAppLifecycleSnapshot().foregroundReady) {
                  setMessage(providerErrorToUserMessage(error, '无法打开 TapTap 授权页面，请重试或使用二维码。'));
                }
              });
            }}
            style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>前往 TapTap 授权</Text>
          </Pressable>
          <Pressable
            onPress={cancelPhigrosLogin}
            style={({ pressed }) => [styles.secondary, { borderColor: theme.accent }, pressed && styles.secondaryPressed]}
          >
            <Text style={[styles.secondaryText, { color: theme.accent }]}>取消授权</Text>
          </Pressable>
          <Text style={styles.hint}>
            可使用其他设备扫描二维码，或前往 TapTap 完成授权。
          </Text>
        </>
      )}
    </>
  );
}
