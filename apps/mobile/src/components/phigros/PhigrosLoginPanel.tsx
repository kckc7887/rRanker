import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { createPhigrosBoundAccount } from '@/domain/bound-account';
import { ProviderError, providerErrorToUserMessage } from '@/providers/errors';
import { PhigrosScoreProvider, type DeviceCodeResult } from '@/providers/phigros-score-provider';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { getForegroundAbortSignal, useAppLifecycle } from '@/state/app-lifecycle';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';

const sessions = new SecureSessionStore();

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
  const phiPollingGenerationRef = useRef<number | null>(null);
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
      setMessage('请在 TapTap 完成授权。');

      try {
        await Linking.openURL(
          `taptap://taptap.com/to?url=${encodeURIComponent(device.qrcodeUrl)}`,
        );
      } catch {
        await Linking.openURL(device.qrcodeUrl);
      }
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
      if (signal.aborted) return;
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
      await sessions.upsertAccount({
        id: account.id,
        gameId: 'phigros',
        providerId: 'phi-taptap',
        displayName: account.displayName,
        scoreDisplay: account.scoreDisplay,
        session: newSession,
      });
      if (signal.aborted) return;
      setSession(newSession);
      invalidateAll();
      reset();
      onSuccess();
    } catch (error) {
      if (signal.aborted) return;
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
    const startTimer = (pollImmediately: boolean) => {
      stopPolling();
      if (pollImmediately) void pollPhigros();
      phiTimer.current = setInterval(() => { void pollPhigros(); }, interval);
    };
    if (!lifecycle.foregroundReady) {
      stopPolling();
      return stopPolling;
    }
    const previousGeneration = phiPollingGenerationRef.current;
    phiPollingGenerationRef.current = lifecycle.foregroundGeneration;
    startTimer(previousGeneration !== null && previousGeneration !== lifecycle.foregroundGeneration);
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {!phiDevice ? (
        <>
          <Pressable
            disabled={busy}
            onPress={() => void beginPhigrosLogin()}
            style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>前往 TapTap 授权</Text>
          </Pressable>
          <Text style={styles.hint}>
            点击后将跳转 TapTap 完成授权，授权成功后自动绑定。
          </Text>
        </>
      ) : (
        <>
          <View style={styles.phiStatus}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
          </View>
          <Pressable
            onPress={cancelPhigrosLogin}
            style={({ pressed }) => [styles.secondary, { borderColor: theme.accent }, pressed && styles.secondaryPressed]}
          >
            <Text style={[styles.secondaryText, { color: theme.accent }]}>取消授权</Text>
          </Pressable>
        </>
      )}
    </>
  );
}
