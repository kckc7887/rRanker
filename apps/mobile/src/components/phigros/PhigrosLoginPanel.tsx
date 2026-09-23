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
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [phiDevice, setPhiDevice] = useState<DeviceCodeResult | null>(null);
  const [phiExpiresAt, setPhiExpiresAt] = useState(0);
  const phiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phiPollingRef = useRef(false);
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
    setPhiExpiresAt(0);
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    phiPollingRef.current = false;
    phiNextAllowedAtRef.current = 0;
  };

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const messageFor = (error: unknown) => providerErrorToUserMessage(error, '验证失败，请稍后重试。');

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
    void queryClient.invalidateQueries({ queryKey: ['game-data'] });
    void queryClient.invalidateQueries({ queryKey: ['songs'] });
  };

  const beginPhigrosLogin = async () => {
    setBusy(true);
    setMessage('正在请求 TapTap 授权…');
    const signal = getForegroundAbortSignal();
    try {
      const device = await PhigrosScoreProvider.beginLogin(signal);
      if (signal.aborted) return;
      setPhiDevice(device);
      setPhiExpiresAt(Date.now() + device.expiresIn * 1000);
      setMessage('请使用二维码或前往 TapTap 完成授权。');
    } catch (error) {
      if (signal.aborted) return;
      setMessage(messageFor(error));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const pollPhigros = async () => {
    if (!phiDevice) return;
    if (phiPollingRef.current) return;
    if (!getAppLifecycleSnapshot().foregroundReady) return;
    const now = Date.now();
    if (now < phiNextAllowedAtRef.current) {
      setMessage('操作太频繁，请稍后再试。');
      return;
    }
    const remaining = Math.max(0, Math.floor((phiExpiresAt - now) / 1000));
    setMessage(`等待授权中…（${remaining} 秒后过期）`);
    phiPollingRef.current = true;
    const signal = getForegroundAbortSignal();
    try {
      const result = await PhigrosScoreProvider.pollLogin(phiDevice, signal);
      if (result === 'pending' || result === 'waiting') return;
      if (result === 'slowdown') {
        if (!getAppLifecycleSnapshot().foregroundReady) return;
        phiNextAllowedAtRef.current = Date.now() + 5_000;
        setMessage('操作太频繁，请稍后再试。');
        return;
      }
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      setMessage('正在保存并验证…');
      const newSession = result;
      if (newSession.mode !== 'phi-session') {
        if (!getAppLifecycleSnapshot().foregroundReady) return;
        setMessage('授权返回异常，请重试');
        return;
      }
      const account = createPhigrosBoundAccount({ playerId: newSession.playerId, rating: 0 });
      await sessions.upsertAccount({
        id: account.id,
        gameId: 'phigros',
        providerId: 'phi-taptap',
        displayName: account.displayName,
        scoreDisplay: account.scoreDisplay,
        session: newSession,
      });
      setSession(newSession);
      invalidateAll();
      reset();
      onSuccess();
    } catch (error) {
      if (signal.aborted || !getAppLifecycleSnapshot().foregroundReady) return;
      const expired = Date.now() >= phiExpiresAt;
      if (!expired && isTransientNetworkError(error)) {
        setMessage('网络波动，自动重试中…');
        return;
      }
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      setMessage(providerErrorToUserMessage(error, '授权失败，请重新尝试。'));
    } finally {
      phiPollingRef.current = false;
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
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    phiPollingRef.current = false;
    phiNextAllowedAtRef.current = 0;
    setPhiDevice(null);
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
            onPress={() => void openTapTapAuthorize(phiDevice.qrcodeUrl)}
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
