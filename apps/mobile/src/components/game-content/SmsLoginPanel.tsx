import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { useAppTheme } from '@/theme/app-theme';
import { ProviderError, providerErrorToUserMessage } from '@/providers/errors';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';

const cooldowns = new Map<string, number>();

export function SmsLoginPanel({ visible, onSuccess, onBusyChange, sendCode, login, validatePhone, cooldownKey }: {
  visible: boolean; onSuccess: () => void; onBusyChange: (busy: boolean) => void;
  cooldownKey: string;
  sendCode: (phone: string, signal: AbortSignal) => Promise<{ retryAfterSeconds?: number; confirmed?: boolean }>;
  login: (phone: string, code: string, signal: AbortSignal) => Promise<void>;
  validatePhone: (phone: string) => boolean;
}) {
  const theme = useAppTheme();
  const lifecycle = useAppLifecycle();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [retryAt, setRetryAt] = useState(() => cooldowns.get(cooldownKey) ?? 0);
  const [now, setNow] = useState(Date.now());
  const retryAtRef = useRef(cooldowns.get(cooldownKey) ?? 0);
  const request = useRef<AbortController | null>(null);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => {
    if (!visible || lifecycle.phase === 'background') {
      request.current?.abort(); request.current = null; setCode(''); setBusy(false); setMessage('');
    }
    if (!visible) setPhone('');
    const deadline = cooldowns.get(cooldownKey) ?? 0;
    retryAtRef.current = deadline; setRetryAt(deadline);
    setNow(Date.now());
  }, [visible, lifecycle.phase, cooldownKey]);
  useEffect(() => {
    if (!visible || !lifecycle.foregroundReady || retryAt <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now(); setNow(current);
      if (current >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [visible, lifecycle.foregroundReady, retryAt]);

  const run = async (action: 'send' | 'login') => {
    if (request.current || !visible || lifecycle.phase === 'background') return;
    const normalized = phone.trim();
    if (!validatePhone(normalized)) { setMessage('请输入正确的手机号'); return; }
    if (action === 'send' && (cooldowns.get(cooldownKey) ?? 0) > Date.now()) return;
    if (action === 'login' && !code.trim()) { setMessage('请输入验证码'); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage(action === 'send' ? '正在发送验证码…' : '正在登录…');
    if (action === 'send') {
      const until = Date.now() + 60_000;
      cooldowns.set(cooldownKey, until);
      retryAtRef.current = until; setRetryAt(until); setNow(Date.now());
    }
    try {
      if (action === 'send') {
        const result = await sendCode(normalized, controller.signal);
        if (controller.signal.aborted) return;
        const until = Date.now() + Math.max(60, result.retryAfterSeconds ?? 60) * 1000;
        cooldowns.set(cooldownKey, until);
        retryAtRef.current = until; setRetryAt(until); setNow(Date.now());
        setMessage(result.confirmed === false ? '发送结果暂时无法确认；如已收到验证码，可继续登录。' : '请查收验证码。');
      } else {
        await login(normalized, code.trim(), controller.signal);
        if (!controller.signal.aborted) { setCode(''); setMessage(''); onSuccess(); }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ProviderError && error.retryAfterSeconds !== undefined && Number.isFinite(error.retryAfterSeconds)) {
          const until = Math.max(retryAtRef.current, Date.now() + error.retryAfterSeconds * 1000);
          cooldowns.set(cooldownKey, until);
          retryAtRef.current = until; setRetryAt(until); setNow(Date.now());
        }
        setMessage(providerErrorToUserMessage(error,
          action === 'send' ? '发送结果暂时无法确认；如已收到验证码，可继续登录。' : '登录失败，请稍后重试。',
          { authentication: action === 'send' ? '验证码发送失败，请确认手机号后稍后重试。' : '验证码不正确或已过期，请重新获取。' }));
        if (action === 'login') setCode('');
      }
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  };

  return <>
    {message ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}
    <TextInput placeholder="手机号" accessibilityLabel="手机号" value={phone}
      onChangeText={value => { setPhone(value); setCode(''); }} keyboardType="phone-pad"
      autoComplete="tel" textContentType="telephoneNumber" autoCapitalize="none" autoCorrect={false} editable={!busy}
      style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} placeholderTextColor={theme.textMuted} />
    <Pressable accessibilityRole="button" accessibilityLabel="获取验证码" disabled={busy || remaining > 0}
      onPress={() => void run('send')} style={[styles.primary, { backgroundColor: theme.accent, opacity: busy || remaining > 0 ? 0.5 : 1 }]}>
      <Text style={styles.primaryText}>{remaining > 0 ? `${remaining} 秒后可重新获取` : '获取验证码'}</Text>
    </Pressable>
    <TextInput placeholder="验证码" accessibilityLabel="验证码" value={code} onChangeText={setCode} keyboardType="number-pad"
      autoComplete="sms-otp" textContentType="oneTimeCode" autoCapitalize="none" autoCorrect={false} maxLength={8} editable={!busy}
      style={[styles.input, { color: theme.text, backgroundColor: theme.input, borderColor: theme.border }]} placeholderTextColor={theme.textMuted} />
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run('login')}
      style={[styles.primary, { backgroundColor: theme.accent, opacity: busy ? 0.5 : 1 }]}>
      <Text style={styles.primaryText}>登录并同步账号</Text>
    </Pressable>
  </>;
}
