import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { useAppTheme } from '@/theme/app-theme';
import { providerErrorToUserMessage } from '@/providers/errors';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';
import type { LoginCredentials } from '@/providers/contracts';

export function PasswordLoginPanel({ visible, onSuccess, onBusyChange, login }: {
  visible: boolean; onSuccess: () => void; onBusyChange: (busy: boolean) => void;
  login: (credentials: LoginCredentials, signal: AbortSignal) => Promise<void>;
}) {
  const theme = useAppTheme(); const lifecycle = useAppLifecycle();
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!visible || lifecycle.phase === 'background') {
      request.current?.abort(); request.current = null; setPassword(''); setBusy(false); setMessage('');
    }
    if (!visible) setUsername('');
  }, [visible, lifecycle.phase]);
  const submit = async () => {
    if (request.current) return;
    if (!username.trim() || !password) { setMessage('请输入用户名和密码'); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true); setMessage('正在登录…');
    try {
      await login({ username: username.trim(), password }, controller.signal);
      if (!controller.signal.aborted) { setPassword(''); setMessage(''); onSuccess(); }
    } catch (error) {
      if (!controller.signal.aborted) { setMessage(providerErrorToUserMessage(error, '登录失败，请稍后重试。')); setPassword(''); }
    } finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  };
  return <>
    {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
    <TextInput placeholder="用户名" accessibilityLabel="用户名" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} editable={!busy}
      style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} placeholderTextColor={theme.textMuted} />
    <TextInput placeholder="密码" accessibilityLabel="密码" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy}
      style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} placeholderTextColor={theme.textMuted} />
    <Pressable disabled={busy} onPress={() => void submit()} style={[styles.primary, { backgroundColor: theme.accent }]}><Text style={styles.primaryText}>账密登录并验证</Text></Pressable>
  </>;
}
