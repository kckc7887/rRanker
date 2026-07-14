import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DivingFishAuthProvider } from '@/providers/diving-fish-auth';
import { DivingFishProvider } from '@/providers/diving-fish-provider';
import { ProviderError } from '@/providers/errors';
import type { ProviderSession } from '@/providers/contracts';
import { validateAndActivateSession } from '@/services/session-validation';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import type { ProviderOption } from '@/domain/game-bind-options';

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
  const insets = useSafeAreaInsets();
  const setSession = useSession((s) => s.setSession);
  const existing = useSession((s) => s.session);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [importToken, setImportToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setUsername('');
    setPassword('');
    setImportToken('');
    setMessage('');
    setBusy(false);
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
    const scoreProvider = new DivingFishProvider(newSession);
    try {
      await validateAndActivateSession(newSession, {
        createProvider: () => scoreProvider,
        save: (sessionToSave) => sessions.save(sessionToSave),
        activate: (sessionToActivate, player) => {
          setSession(sessionToActivate, {
            displayName: player.displayName,
            rating: player.rating,
            playerId: player.id,
            providerId: provider?.id ?? 'diving-fish',
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

  const login = async () => {
    if (!username.trim() || !password) { setMessage('请输入水鱼用户名和密码'); return; }
    setBusy(true); setMessage('正在验证登录态…');
    try {
      const newSession = await auth.loginWithPassword({ username: username.trim(), password });
      await validateAndActivate(newSession);
      reset();
      onSuccess();
    } catch (error) { setMessage(messageFor(error)); setBusy(false); setPassword(''); }
  };

  const connectWithToken = async () => {
    setBusy(true); setMessage('正在验证 Import-Token…');
    try {
      const newSession = auth.useImportToken(importToken);
      await validateAndActivate(newSession);
      reset();
      onSuccess();
    } catch (error) { setMessage(messageFor(error)); setBusy(false); }
  };

  if (!provider) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭登录"
            hitSlop={12}
            disabled={busy}
            onPress={close}
            style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
          >
            <Text style={styles.close}>取消</Text>
          </Pressable>
          <Text style={styles.title}>登录查分器</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <Image source={provider.icon} style={styles.icon} />
            <Text style={styles.providerName}>{provider.title}</Text>
            <Text style={styles.gameLine}>用于绑定 {gameTitle}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.body}>绑定后，总览、最佳与成绩将使用该账号的远程数据。</Text>
            {existing ? (
              <Text style={styles.hint}>当前已有绑定账号；添加成功后将替换现有登录态。</Text>
            ) : null}
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
              style={styles.input}
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
              style={styles.input}
            />
            <Pressable
              disabled={busy}
              onPress={() => void login()}
              style={({ pressed }) => [styles.primary, pressed && !busy && styles.primaryPressed]}
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
              placeholder="Import-Token"
              secureTextEntry
              value={importToken}
              onChangeText={setImportToken}
              style={styles.input}
            />
            <Text style={styles.hint}>Import-Token 可从水鱼查分器网页版个人设置获取</Text>
            <Pressable
              disabled={busy}
              onPress={() => void connectWithToken()}
              style={({ pressed }) => [styles.secondary, pressed && !busy && styles.secondaryPressed]}
            >
              <Text style={styles.secondaryText}>验证并保存 Token</Text>
            </Pressable>
            <Text style={styles.security}>
              密码仅用于当次登录请求；JWT/Import-Token 仅进入 SecureStore；成绩快照进入 SQLite。本应用不会生成或刷新 Import-Token。
            </Text>
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
});
