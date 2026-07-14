import { useState } from 'react';
import {
  Alert,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { GamePickerSheet } from '@/components/GamePickerSheet';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import {
  LOCAL_MAIMAI_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import {
  findGame,
  findProvider,
  type GameId,
  type ProviderId,
  type ProviderOption,
} from '@/domain/game-bind-options';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import type { ProviderSession } from '@/providers/contracts';
import { useGamePickerUi } from '@/state/game-picker-ui';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();

function sessionModeLabel(session: ProviderSession | undefined): string {
  if (!session) return '无凭据';
  if (session.mode === 'jwt') return '仅登录（不可上传）';
  if (session.mode === 'import-token') return '已可上传';
  if (session.mode === 'lxns-oauth') return 'OAuth（可同步）';
  return 'Cookie（当前会话）';
}

function isBoundRemoteAccount(account: BoundAccount): boolean {
  return account.gameId === 'maimai' && account.id !== LOCAL_MAIMAI_ACCOUNT_ID;
}

export default function GameAccountsScreen() {
  const boundAccounts = useSession((s) => s.boundAccounts);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const selectBoundAccount = useSession((s) => s.selectBoundAccount);
  const removeBoundAccount = useSession((s) => s.removeBoundAccount);
  const restoreError = useSession((s) => s.restoreError);
  const library = useUserLibrary();
  const tabBottomInset = useNativeTabBottomInset();
  const expandedGameId = useGamePickerUi((s) => s.expandedGameId);
  const setExpandedGameId = useGamePickerUi((s) => s.setExpandedGameId);
  const toggleExpandedGameId = useGamePickerUi((s) => s.toggleExpandedGameId);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loginProviderId, setLoginProviderId] = useState<ProviderId | null>(null);
  const [loginGameId, setLoginGameId] = useState<GameId | null>(null);
  const [reopenPickerAfterLogin, setReopenPickerAfterLogin] = useState(false);

  const remoteAccounts = boundAccounts.filter(isBoundRemoteAccount);

  const clearRemoteCaches = () => {
    for (const key of ['score-snapshot', 'game-data', 'songs', 'detailed-catalog', 'plates']) {
      queryClient.removeQueries({ queryKey: [key] });
    }
  };

  const unbindAccount = async (accountId: string, includePersonalData: boolean) => {
    setBusy(true);
    const failures: string[] = [];
    const attempt = async (label: string, action: () => Promise<unknown>) => {
      try { await action(); } catch { failures.push(label); }
    };
    await attempt('凭据', () => sessions.removeAccount(accountId));
    await attempt('缓存', () => snapshots.clear(accountId));
    if (includePersonalData) await attempt('个人数据', () => library.clearUserData());
    removeBoundAccount(accountId);
    clearRemoteCaches();
    if (failures.length > 0) setMessage(`部分清除失败（${failures.join('、')}），其余项目已清除，请重试`);
    else setMessage(includePersonalData ? '已解除绑定并清除个人数据' : '已解除绑定；个人数据已保留');
    setBusy(false);
  };

  const promptUnbind = (account: BoundAccount) => Alert.alert(
    '解除绑定',
    `将清除「${account.displayName}」的本机凭据和成绩缓存。是否同时删除收藏、练习清单和本地标签？`,
    [
      { text: '取消', style: 'cancel' },
      { text: '仅凭据与缓存', onPress: () => void unbindAccount(account.id, false) },
      { text: '同时删除个人数据', style: 'destructive', onPress: () => void unbindAccount(account.id, true) },
    ],
  );

  const openPicker = () => {
    setExpandedGameId('maimai');
    setPickerVisible(true);
  };

  const closePicker = () => setPickerVisible(false);

  const openLogin = (gameId: GameId, provider: ProviderOption) => {
    if (!provider.available) {
      Alert.alert(provider.title, '绑定尚未实现，待后续开放。');
      return;
    }
    setExpandedGameId(gameId);
    setLoginGameId(gameId);
    setLoginProviderId(provider.id);
    setReopenPickerAfterLogin(true);
    setPickerVisible(false);
    InteractionManager.runAfterInteractions(() => undefined);
  };

  const closeLogin = (options?: { reopenPicker?: boolean }) => {
    const shouldReopen = options?.reopenPicker ?? reopenPickerAfterLogin;
    setLoginProviderId(null);
    setLoginGameId(null);
    setReopenPickerAfterLogin(false);
    if (shouldReopen) {
      InteractionManager.runAfterInteractions(() => setPickerVisible(true));
    }
  };

  const finishLogin = () => {
    setReopenPickerAfterLogin(false);
    setLoginProviderId(null);
    setLoginGameId(null);
    setPickerVisible(false);
  };

  const onSelectAccount = (account: BoundAccount) => {
    selectBoundAccount(account.id);
    void sessions.setActiveAccountId(account.id);
  };

  const loginProvider = loginProviderId ? findProvider(loginProviderId) ?? null : null;
  const loginGame = loginGameId ? findGame(loginGameId) : null;
  const loginVisible = loginProviderId !== null && !pickerVisible;

  return (
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 88 }]}
        scrollIndicatorInsets={{ bottom: tabBottomInset }}
      >
        {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {remoteAccounts.length > 0 ? (
          remoteAccounts.map((account) => {
            const accountSession = sessionsByAccountId[account.id];
            const isActive = account.id === activeAccountId;
            return (
              <View key={account.id} style={styles.card}>
                <Text style={styles.game}>舞萌 DX · {account.providerTitle}</Text>
                <Text style={styles.name}>{account.displayName}</Text>
                <Text style={styles.meta}>
                  {account.scoreLabel} {account.scoreDisplay || '—'}
                </Text>
                <Text style={styles.meta}>登录方式：{sessionModeLabel(accountSession)}</Text>
                <Text style={styles.state}>{isActive ? '当前使用中' : '已绑定'}</Text>
                {!isActive ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`切换到 ${account.displayName}`}
                    disabled={busy}
                    onPress={() => onSelectAccount(account)}
                  >
                    <Text style={styles.switch}>切换到此账号</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`解除绑定 ${account.displayName}`}
                  disabled={busy}
                  onPress={() => promptUnbind(account)}
                >
                  <Text style={styles.unbind}>解除绑定</Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>暂无已绑定账号</Text>
            <Text style={styles.emptyBody}>点击右下角添加，展开游戏后选择查分器绑定。同一查分器可绑定多个账号。</Text>
          </View>
        )}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="添加游戏账号"
        disabled={busy}
        onPress={openPicker}
        style={({ pressed }) => [styles.fab, { bottom: tabBottomInset + 20 }, pressed && styles.fabPressed]}
      >
        <SymbolView
          name="plus"
          tintColor="#FFF"
          size={28}
          weight="semibold"
          fallback={<Ionicons name="add" size={28} color="#FFF" />}
        />
      </Pressable>

      <GamePickerSheet
        mode="bind"
        visible={pickerVisible}
        expandedGameId={expandedGameId}
        onClose={closePicker}
        onToggleGame={toggleExpandedGameId}
        onSelectProvider={openLogin}
        onSelectUnavailableGame={(title, detail) => Alert.alert(title, `${detail}，待后续开放。`)}
      />

      <ProviderLoginSheet
        visible={loginVisible}
        provider={loginProvider}
        gameTitle={loginGame?.title ?? ''}
        onClose={() => closeLogin({ reopenPicker: true })}
        onSuccess={finishLogin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 8 },
  game: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  name: { color: '#111827', fontSize: 20, fontWeight: '700' },
  meta: { color: '#4B5563', fontSize: 14 },
  state: { color: '#246BFD', fontWeight: '600', marginTop: 4 },
  switch: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
  unbind: { color: '#B42318', textAlign: 'center', paddingTop: 8 },
  emptyCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 24, gap: 8 },
  emptyTitle: { color: '#111827', fontSize: 17, fontWeight: '700' },
  emptyBody: { color: '#6B7280', lineHeight: 20 },
  message: { color: '#4B5563', fontSize: 13 },
  error: { color: '#B42318', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#246BFD',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabPressed: { opacity: 0.88 },
});
