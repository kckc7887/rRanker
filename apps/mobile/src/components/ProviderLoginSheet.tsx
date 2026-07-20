import { useState, useRef, useEffect } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createMaimaiBoundAccount, createPhigrosBoundAccount, LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';
import type { ProviderOption } from '@/domain/game-bind-options';
import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import { beginLxnsAuthorize, exchangeLxnsAuthorizationCode } from '@/providers/lxns-oauth';
import { LxnsScoreProvider } from '@/providers/lxns-score-provider';
import { PhigrosScoreProvider, type DeviceCodeResult } from '@/providers/phigros-score-provider';
import { validateAndActivateSession } from '@/services/session-validation';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const auth = new DivingFishAuthProvider();
const sessions = new SecureSessionStore();

export function ProviderLoginSheet({
  visible,
  provider,
  gameTitle,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  provider: ProviderOption | null;
  gameTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const setSession = useSession((s) => s.setSession);
  const boundMaimaiCount = useSession((s) => s.boundAccounts.filter(
    (account) => account.gameId === 'maimai' && account.id !== LOCAL_MAIMAI_ACCOUNT_ID,
  ).length);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [importToken, setImportToken] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [phiDevice, setPhiDevice] = useState<DeviceCodeResult | null>(null);
  const [phiExpiresAt, setPhiExpiresAt] = useState(0);
  const phiTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLxns = provider?.id === 'lxns';
  const isPhigros = provider?.id === 'phi-taptap';

  const reset = () => {
    setUsername('');
    setPassword('');
    setImportToken('');
    setAuthCode('');
    setMessage('');
    setBusy(false);
    setPhiDevice(null);
    setPhiExpiresAt(0);
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
  };

  const close = () => {
    reset();
    onClose();
  };

  const messageFor = (error: unknown) => error instanceof ProviderError ? error.message : '验证失败，请稍后重试';

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['score-snapshot'] });
    void queryClient.invalidateQueries({ queryKey: ['game-data'] });
    void queryClient.invalidateQueries({ queryKey: ['songs'] });
  };

  const validateAndActivate = async (newSession: ProviderSession) => {
    const providerId = provider?.id === 'lxns' ? 'lxns' : 'diving-fish';
    try {
      await validateAndActivateSession(newSession, {
        createProvider: (session) => (
          providerId === 'lxns'
            ? new LxnsScoreProvider(session)
            : new DivingFishProvider(session)
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
        throw new ProviderError('authentication', '账号密码正确，但 iOS 未能携带登录 Cookie', false, { cause: error });
      }
      throw error;
    }
  };

  const openLxnsAuthorize = async () => {
    setBusy(true);
    setMessage('正在打开落雪授权页…');
    try {
      const url = await beginLxnsAuthorize();
      await Linking.openURL(url);
      setMessage('请在浏览器完成授权，将授权码粘贴到下方。');
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const connectWithLxnsCode = async () => {
    if (!authCode.trim()) { setMessage('请粘贴落雪授权码'); return; }
    setBusy(true);
    setMessage('正在换取令牌并验证成绩…');
    try {
      const newSession = await exchangeLxnsAuthorizationCode(authCode);
      await validateAndActivate(newSession);
      reset();
      onSuccess();
    } catch (error) {
      setMessage(messageFor(error));
      setBusy(false);
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

  const beginPhigrosLogin = async () => {
    setBusy(true);
    setMessage('正在请求 TapTap 授权…');
    try {
      const device = await PhigrosScoreProvider.beginLogin();
      setPhiDevice(device);
      setPhiExpiresAt(Date.now() + device.expiresIn * 1000);
      setMessage('请在 TapTap 完成授权。');

      try {
        await Linking.openURL(
          `taptap://taptap.com/to?url=${encodeURIComponent(device.qrcodeUrl + '/for-client')}`,
        );
      } catch {
        await Linking.openURL(device.qrcodeUrl);
      }
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const pollPhigros = async () => {
    if (!phiDevice) return;
    const remaining = Math.max(0, Math.floor((phiExpiresAt - Date.now()) / 1000));
    setMessage(`等待授权中…（${remaining} 秒后过期）`);
    try {
      const result = await PhigrosScoreProvider.pollLogin(phiDevice);
      if (result === 'pending' || result === 'waiting') return;
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
      setSession(newSession);
      invalidateAll();
      reset();
      onSuccess();
    } catch (error) {
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      setMessage(messageFor(error));
    }
  };

  useEffect(() => {
    if (!phiDevice) return;
    const interval = phiDevice.interval * 1000;
    phiTimer.current = setInterval(() => { void pollPhigros(); }, interval);
    return () => {
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phiDevice]);

  const cancelPhigrosLogin = () => {
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    setPhiDevice(null);
    setPhiExpiresAt(0);
    setMessage('');
    setBusy(false);
  };

  if (!provider) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: theme.background }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭登录"
            hitSlop={12}
            disabled={busy}
            onPress={close}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Text style={[styles.close, { color: theme.accent }]}>取消</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>登录查分器</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <Image source={provider.icon} style={styles.icon} />
            <Text style={[styles.providerName, { color: theme.text }]}>{provider.title}</Text>
            <Text style={[styles.gameLine, { color: theme.textMuted }]}>用于绑定 {gameTitle}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>绑定后，总览、最佳与成绩将使用该账号的远程数据。</Text>
            {boundMaimaiCount > 0 ? (
              <Text style={styles.hint}>可同时保存多个查分器账号；同一玩家再次登录会更新该账号凭据。</Text>
            ) : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}

            {isPhigros ? (
              <>
                {!phiDevice ? (
                  <>
                    <Pressable
                      disabled={busy}
                      onPress={() => void beginPhigrosLogin()}
                      style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
                    >
                      <Text style={styles.primaryText}>打开 TapTap 授权页</Text>
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
                <Text style={styles.security}>
                  Session Token 仅保存在系统 SecureStore，不进入 SQLite 或日志。
                </Text>
              </>
            ) : isLxns ? (
              <>
                <Pressable
                  disabled={busy}
                  onPress={() => void openLxnsAuthorize()}
                  style={({ pressed }) => [styles.primary, { backgroundColor: theme.accent }, pressed && !busy && styles.primaryPressed]}
                >
                  <Text style={styles.primaryText}>打开落雪授权页</Text>
                </Pressable>
                <Text style={styles.hint}>
                  授权页无回调；同意后复制授权码，粘贴到下方验证。本 App 使用 PKCE，不保存应用秘钥。
                </Text>
                <TextInput
                  autoCapitalize="characters"
                  autoCorrect={false}
                  textContentType="oneTimeCode"
                  autoComplete="off"
                  editable={!busy}
                  placeholder="授权码（如 JVJ6-VPTM-MGHZ）"
                  value={authCode}
                  onChangeText={setAuthCode}
                  placeholderTextColor={theme.textMuted}
                  style={[styles.input, { backgroundColor: theme.input, borderColor: theme.border, color: theme.text }]}
                />
                <Pressable
                  disabled={busy}
                  onPress={() => void connectWithLxnsCode()}
                  style={({ pressed }) => [styles.secondary, { borderColor: theme.accent }, pressed && !busy && styles.secondaryPressed]}
                >
                  <Text style={[styles.secondaryText, { color: theme.accent }]}>验证授权码并绑定</Text>
                </Pressable>
                <Text style={styles.security}>
                  Access Token 约 15 分钟过期；刷新令牌保存在系统 SecureStore，不进入 SQLite 或日志。
                </Text>
              </>
            ) : (
              <>
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
                  placeholder="密码（不会保存）"
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
                <Text style={styles.security}>
                  密码仅用于当次登录；上传凭证写入系统 SecureStore，不进入 SQLite 或日志。
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F3F7' },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAction: { minWidth: 56, paddingVertical: 4 },
  headerSpacer: { minWidth: 56 },
  title: { flex: 1, textAlign: 'center', color: '#111827', fontSize: 17, fontWeight: '700' },
  close: { color: '#246BFD', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  content: { paddingHorizontal: 16, paddingBottom: 28, gap: 14 },
  identity: { alignItems: 'center', gap: 6, paddingTop: 4, paddingBottom: 2 },
  icon: { width: 64, height: 64, borderRadius: 16 },
  providerName: { color: '#111827', fontSize: 20, fontWeight: '700' },
  gameLine: { color: '#6B7280', fontSize: 13 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 18, gap: 10 },
  body: { color: '#4B5563', lineHeight: 21 },
  message: { color: '#4B5563', fontSize: 13 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, padding: 12, color: '#111827' },
  primary: { backgroundColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  primaryPressed: { opacity: 0.9 },
  primaryText: { color: '#FFF', fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: '#246BFD', borderRadius: 10, padding: 13, alignItems: 'center' },
  secondaryPressed: { backgroundColor: '#F0F5FF' },
  secondaryText: { color: '#246BFD', fontWeight: '700' },
  or: { color: '#9CA3AF', textAlign: 'center' },
  hint: { color: '#6B7280', fontSize: 12, lineHeight: 16 },
  security: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 4 },
  phiStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
