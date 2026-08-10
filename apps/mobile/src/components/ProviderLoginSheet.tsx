import { useState, useRef, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CHUNITHM_TEMP_ACCOUNT_ID,
  createMaimaiBoundAccount,
  createPhigrosBoundAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import type { GameId, ProviderOption } from '@/domain/game-bind-options';
import { reusableLxnsAccounts } from '@/domain/lxns-account-reuse';
import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import { beginLxnsAuthorize, exchangeLxnsAuthorizationCode } from '@/providers/lxns-oauth';
import { PhigrosScoreProvider, type DeviceCodeResult } from '@/providers/phigros-score-provider';
import { bindLxnsAccount, type LxnsBindingResult } from '@/services/lxns-account-binding';
import { validateAndActivateSession } from '@/services/session-validation';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';

const auth = new DivingFishAuthProvider();
const sessions = new SecureSessionStore();
const chunithmTempAccount = new ChunithmTempAccountStore();

/** 后台挂起/断连等瞬时网络错误：不应终止授权流程，保留轮询等待下一次请求 */
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

export function ProviderLoginSheet({
  visible,
  provider,
  gameId,
  gameTitle,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  provider: ProviderOption | null;
  gameId: GameId;
  gameTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const setSession = useSession((s) => s.setSession);
  const boundAccounts = useSession((s) => s.boundAccounts);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const credentialIdsByAccountId = useSession((s) => s.credentialIdsByAccountId);
  const removeBoundAccount = useSession((s) => s.removeBoundAccount);
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
  const [showReusableAccounts, setShowReusableAccounts] = useState(false);
  const phiTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const phiPollingRef = useRef(false);
  const phiNextAllowedAtRef = useRef(0);

  const isLxns = provider?.id === 'lxns';
  const isPhigros = provider?.id === 'phi-taptap';
  const reusableAccounts = useMemo(() => {
    if (!isLxns || (gameId !== 'maimai' && gameId !== 'chunithm')) return [];
    return reusableLxnsAccounts({
      targetGameId: gameId,
      accounts: boundAccounts,
      sessionsByAccountId,
      credentialIdsByAccountId,
    });
  }, [
    boundAccounts,
    credentialIdsByAccountId,
    gameId,
    isLxns,
    sessionsByAccountId,
  ]);

  const reset = () => {
    setUsername('');
    setPassword('');
    setImportToken('');
    setAuthCode('');
    setMessage('');
    setBusy(false);
    setPhiDevice(null);
    setPhiExpiresAt(0);
    setShowReusableAccounts(false);
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    phiPollingRef.current = false;
    phiNextAllowedAtRef.current = 0;
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
    const providerId = 'diving-fish';
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
        throw new ProviderError('authentication', '账号密码正确，但 iOS 未能携带登录 Cookie', false, { cause: error });
      }
      throw error;
    }
  };

  const activateLxnsBinding = async (result: LxnsBindingResult) => {
    const rating = Number(result.account.scoreDisplay);
    setSession(result.session, {
      accountId: result.account.id,
      credentialId: result.credentialId,
      displayName: result.account.displayName,
      rating: Number.isFinite(rating) ? rating : null,
      providerId: 'lxns',
      gameId: result.account.gameId,
      avatarUrl: result.account.avatarUrl,
      ratingPossession: result.account.ratingPossession,
    });
    if (result.account.gameId === 'chunithm') {
      removeBoundAccount(CHUNITHM_TEMP_ACCOUNT_ID);
      await chunithmTempAccount.remove().catch(() => undefined);
    }
    invalidateAll();
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
      const result = await bindLxnsAccount({
        gameId: gameId === 'chunithm' ? 'chunithm' : 'maimai',
        session: newSession,
      });
      await activateLxnsBinding(result);
      reset();
      onSuccess();
    } catch (error) {
      setMessage(messageFor(error));
      setBusy(false);
    }
  };

  const connectWithExistingLxns = async (account: BoundAccount) => {
    const session = sessionsByAccountId[account.id];
    const credentialId = credentialIdsByAccountId[account.id];
    if (session?.mode !== 'lxns-oauth' || !credentialId) {
      setMessage('已有落雪账号凭据不可用，请重新授权');
      return;
    }
    setBusy(true);
    setMessage(`正在使用「${account.displayName}」绑定 ${gameTitle}…`);
    try {
      const result = await bindLxnsAccount({
        gameId: gameId === 'chunithm' ? 'chunithm' : 'maimai',
        session,
        credentialId,
      });
      await activateLxnsBinding(result);
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
          `taptap://taptap.com/to?url=${encodeURIComponent(device.qrcodeUrl)}`,
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
    if (phiPollingRef.current) return;
    const now = Date.now();
    if (now < phiNextAllowedAtRef.current) {
      setMessage('TapTap 请求过于频繁，已自动放慢轮询…');
      return;
    }
    const remaining = Math.max(0, Math.floor((phiExpiresAt - now) / 1000));
    setMessage(`等待授权中…（${remaining} 秒后过期）`);
    phiPollingRef.current = true;
    try {
      const result = await PhigrosScoreProvider.pollLogin(phiDevice);
      if (result === 'pending' || result === 'waiting') return;
      if (result === 'slowdown') {
        phiNextAllowedAtRef.current = Date.now() + 5_000;
        setMessage('TapTap 请求过于频繁，已自动放慢轮询…');
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
      setSession(newSession);
      invalidateAll();
      reset();
      onSuccess();
    } catch (error) {
      const expired = Date.now() >= phiExpiresAt;
      if (!expired && isTransientNetworkError(error)) {
        setMessage('网络波动，自动重试中…');
        return;
      }
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`授权失败：${detail}`);
    } finally {
      phiPollingRef.current = false;
    }
  };

  useEffect(() => {
    if (!phiDevice) return;
    const interval = phiDevice.interval * 1000;
    const startTimer = () => {
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
      phiTimer.current = setInterval(() => { void pollPhigros(); }, interval);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        startTimer();
        void pollPhigros();
      } else if (phiTimer.current) {
        clearInterval(phiTimer.current);
        phiTimer.current = null;
      }
    });
    startTimer();
    return () => {
      subscription.remove();
      if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phiDevice]);

  const cancelPhigrosLogin = () => {
    if (phiTimer.current) { clearInterval(phiTimer.current); phiTimer.current = null; }
    phiPollingRef.current = false;
    phiNextAllowedAtRef.current = 0;
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
                {reusableAccounts.length > 0 ? (
                  <View style={[styles.reuseSection, { borderTopColor: theme.border }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="使用已有落雪账号"
                      disabled={busy}
                      onPress={() => setShowReusableAccounts((current) => !current)}
                      style={({ pressed }) => [
                        styles.secondary,
                        { borderColor: theme.accent },
                        pressed && !busy && styles.secondaryPressed,
                      ]}
                    >
                      <Text style={[styles.secondaryText, { color: theme.accent }]}>
                        使用已有落雪账号
                      </Text>
                    </Pressable>
                    {showReusableAccounts ? (
                      <View style={styles.reuseList}>
                        {reusableAccounts.map((account) => (
                          <Pressable
                            key={credentialIdsByAccountId[account.id]}
                            accessibilityRole="button"
                            accessibilityLabel={`使用已有落雪账号 ${account.displayName}`}
                            disabled={busy}
                            onPress={() => void connectWithExistingLxns(account)}
                            style={({ pressed }) => [
                              styles.reuseAccount,
                              { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
                              pressed && !busy && styles.secondaryPressed,
                            ]}
                          >
                            <Text style={[styles.reuseName, { color: theme.text }]}>
                              {account.displayName}
                            </Text>
                            <Text style={[styles.hint, { color: theme.textMuted }]}>
                              已绑定{account.gameId === 'maimai' ? '舞萌 DX' : '中二节奏'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
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
  reuseSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4, paddingTop: 14, gap: 10 },
  reuseList: { gap: 8 },
  reuseAccount: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  reuseName: { fontSize: 15, fontWeight: '700' },
});
