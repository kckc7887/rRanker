import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';
import { createMaimaiBoundAccount } from '@/domain/bound-account';
import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError, providerErrorToUserMessage } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import { validateAndActivateSession } from '@/services/session-validation';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { providerLoginSheetStyles as styles } from '@/components/provider-login-sheet-styles';

const auth = new DivingFishAuthProvider();
const sessions = new SecureSessionStore();

export function DivingFishLoginPanel({
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [importToken, setImportToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (lifecycle.foregroundReady) setBusy(false);
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady]);

  const reset = () => {
    setUsername('');
    setPassword('');
    setImportToken('');
    setMessage('');
    setBusy(false);
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

  const validateAndActivate = async (newSession: ProviderSession) => {
    const providerId = 'diving-fish' as const;
    try {
      await validateAndActivateSession(newSession, {
        createProvider: (session) => (
          new DivingFishProvider(session)
        ),
        save: async (sessionToSave, player) => {
          const account = createMaimaiBoundAccount({
            providerId,
            displayName: player.displayName,
            rating: player.rating,
            playerId: player.id,
          });
          await sessions.upsertAccount({
            id: account.id,
            gameId: 'maimai',
            providerId,
            displayName: account.displayName,
            scoreDisplay: account.scoreDisplay,
            session: sessionToSave,
          });
        },
        activate: (sessionToActivate, player) => {
          setSession(sessionToActivate, {
            displayName: player.displayName,
            rating: player.rating,
            playerId: player.id,
            providerId,
          });
          invalidateAll();
        },
      });
    } catch (error) {
      if (newSession.mode === 'cookie-jar' && error instanceof ProviderError && error.code === 'authentication') {
        throw new ProviderError('authentication', 'iOS login session missing', false, { cause: error });
      }
      throw error;
    }
  };

  const login = async () => {
    if (!username.trim() || !password) { setMessage('请输入水鱼用户名和密码'); return; }
    setBusy(true); setMessage('正在登录并获取上传凭证…');
    try {
      const newSession = await auth.loginWithPassword({ username: username.trim(), password });
      await validateAndActivate(newSession);
      reset();
      onSuccess();
    } catch (error) { setMessage(messageFor(error)); setBusy(false); setPassword(''); }
  };

  const connectWithToken = async () => {
    setBusy(true); setMessage('正在验证上传凭证…');
    try {
      const newSession = auth.useImportToken(importToken);
      await validateAndActivate(newSession);
      reset();
      onSuccess();
    } catch (error) { setMessage(messageFor(error)); setBusy(false); }
  };

  return (
    <>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="none"
        autoComplete="off"
        importantForAutofill="no"
        editable={!busy}
        placeholder="用户名"
        value={username}
        onChangeText={setUsername}
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        importantForAutofill="no"
        editable={!busy}
        placeholder="密码"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
      />
      <Pressable
        disabled={busy}
        onPress={() => void login()}
        style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>账密登录并验证</Text>
      </Pressable>
      <Text style={styles.or}>或</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="oneTimeCode"
        autoComplete="off"
        editable={!busy}
        placeholder="上传凭证"
        secureTextEntry
        value={importToken}
        onChangeText={setImportToken}
        placeholderTextColor={theme.textMuted}
        style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
      />
      <Pressable
        disabled={busy}
        onPress={() => void connectWithToken()}
        style={({ pressed }) => [styles.secondary, { borderColor: theme.accent }, pressed && !busy && styles.secondaryPressed]}
      >
        <Text style={[styles.secondaryText, { color: theme.accent }]}>验证并保存凭证</Text>
      </Pressable>
    </>
  );
}
