import { useState } from 'react';
import {
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GamePickerSheet } from '@/components/GamePickerSheet';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { RenameLocalAccountSheet } from '@/components/RenameLocalAccountSheet';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import {
  createAdditionalLocalMaimaiAccountId,
  createLocalMaimaiAccount,
  createMaxedMaimaiTestAccount,
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
import { useUserLibrary } from '@/hooks/use-user-library';
import type { ProviderSession } from '@/providers/contracts';
import { useGamePickerUi } from '@/state/game-picker-ui';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { queryClient } from '@/state/query-client';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { LocalAccountStore } from '@/storage/local-account-store';
import { DemoAccountStore } from '@/storage/demo-account-store';
import { patchMaimaiPlayerDisplayName } from '@/services/invalidate-account-data';
import { useNotification } from '@/components/AppNotification';
import { useAppTheme } from '@/theme/app-theme';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();
const localAccounts = new LocalAccountStore();
const demoAccounts = new DemoAccountStore();

function sessionModeLabel(session: ProviderSession | undefined): string {
  if (!session) return '无凭据';
  if (session.mode === 'jwt') return '仅登录（不可上传）';
  if (session.mode === 'import-token') return '已可上传';
  if (session.mode === 'lxns-oauth') return 'OAuth（可上传）';
  return 'Cookie（当前会话）';
}

export function GameAccountsScreen() {
  const theme = useAppTheme();
  const { showActionNotification, showNotification } = useNotification();
  const boundAccounts = useSession((s) => s.boundAccounts);
  const sessionsByAccountId = useSession((s) => s.sessionsByAccountId);
  const activeAccountId = useSession((s) => s.activeAccountId);
  const selectBoundAccount = useSession((s) => s.selectBoundAccount);
  const upsertBoundAccount = useSession((s) => s.upsertBoundAccount);
  const renameLocalAccount = useSession((s) => s.renameLocalAccount);
  const removeBoundAccount = useSession((s) => s.removeBoundAccount);
  const restoreError = useSession((s) => s.restoreError);
  const library = useUserLibrary();
  const safeAreaInsets = useSafeAreaInsets();
  const expandedPickerGameId = useGamePickerUi((s) => s.expandedGameId);
  const setExpandedPickerGameId = useGamePickerUi((s) => s.setExpandedGameId);
  const toggleExpandedPickerGameId = useGamePickerUi((s) => s.toggleExpandedGameId);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [loginProviderId, setLoginProviderId] = useState<ProviderId | null>(null);
  const [loginGameId, setLoginGameId] = useState<GameId | null>(null);
  const [reopenPickerAfterLogin, setReopenPickerAfterLogin] = useState(false);
  const [renameAccount, setRenameAccount] = useState<BoundAccount | null>(null);

  const [collapsedManagedGameIds, setCollapsedManagedGameIds] = useState<Set<GameId>>(() => new Set());

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

  const promptUnbind = (account: BoundAccount) => showActionNotification({
    title: '解除绑定',
    message: `将清除「${account.displayName}」的本机凭据和成绩缓存。是否同时删除收藏、练习清单和本地标签？`,
    variant: 'warning',
    actions: [
      { label: '取消', tone: 'cancel' },
      { label: '仅凭据与缓存', onPress: () => unbindAccount(account.id, false) },
      { label: '同时删除个人数据', tone: 'destructive', onPress: () => unbindAccount(account.id, true) },
    ],
  });

  const addLocalAccount = async () => {
    setBusy(true);
    try {
      const localCount = boundAccounts.filter((account) => account.providerId === 'local').length;
      const accountId = localCount === 0
        ? LOCAL_MAIMAI_ACCOUNT_ID
        : createAdditionalLocalMaimaiAccountId(boundAccounts.map((item) => item.id));
      const account = createLocalMaimaiAccount(
        localCount === 0 ? '本地玩家' : `本地玩家 ${localCount + 1}`,
        0,
        accountId,
      );
      await localAccounts.upsert({ id: account.id, displayName: account.displayName });
      upsertBoundAccount(account);
      // Close the picker first; switching account + opening rename in the same
      // tick stacks formSheet dismiss, pageSheet present, keyboard, and query
      // refetch — which freezes the UI and can stretch the iOS tab bar.
      setPickerVisible(false);
      InteractionManager.runAfterInteractions(() => {
        selectBoundAccount(account.id);
        void sessions.setActiveAccountId(account.id);
        setRenameAccount(account);
      });
    } catch (error) {
      showNotification({
        title: '添加失败',
        message: error instanceof Error ? error.message : '无法添加本地玩家，请重试。',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const addDemoAccount = async () => {
    setBusy(true);
    try {
      const existing = boundAccounts.find((account) => account.providerId === 'maimai-test');
      if (existing) {
        setPickerVisible(false);
        InteractionManager.runAfterInteractions(() => {
          onSelectAccount(existing);
          setMessage(`示例账号「${existing.displayName}」已在列表中，已切换到该账号`);
        });
        return;
      }
      const account = createMaxedMaimaiTestAccount();
      await demoAccounts.upsert({ id: account.id, displayName: account.displayName });
      upsertBoundAccount(account);
      setPickerVisible(false);
      InteractionManager.runAfterInteractions(() => {
        selectBoundAccount(account.id);
        void sessions.setActiveAccountId(account.id);
        setMessage(`已添加示例账号「${account.displayName}」`);
      });
    } catch (error) {
      showNotification({
        title: '添加失败',
        message: error instanceof Error ? error.message : '无法添加示例账号，请重试。',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const saveLocalAccountName = async (account: BoundAccount, displayName: string) => {
    await localAccounts.upsert({ id: account.id, displayName });
    renameLocalAccount(account.id, displayName);
    patchMaimaiPlayerDisplayName(account.id, displayName, queryClient);
    setMessage(`已将本地玩家改名为「${displayName}」`);
  };

  const persistActiveAccountId = async () => {
    const nextId = useSession.getState().activeAccountId;
    if (!nextId || nextId === UNBOUND_ACCOUNT_ID) {
      await sessions.setActiveAccountId(null);
      return;
    }
    await sessions.setActiveAccountId(nextId);
  };

  const removeLocalAccount = async (account: BoundAccount) => {
    setBusy(true);
    const failures: string[] = [];
    try { await localAccounts.remove(account.id); } catch { failures.push('账号'); }
    try { await snapshots.clear(account.id); } catch { failures.push('成绩'); }
    removeBoundAccount(account.id);
    await persistActiveAccountId();
    clearRemoteCaches();
    setMessage(failures.length > 0
      ? `本地玩家已从列表移除，但${failures.join('、')}数据清理失败`
      : `已删除本地玩家「${account.displayName}」`);
    setBusy(false);
  };

  const removeDemoAccount = async (account: BoundAccount) => {
    setBusy(true);
    try { await demoAccounts.remove(account.id); } catch { /* ignore */ }
    removeBoundAccount(account.id);
    await persistActiveAccountId();
    clearRemoteCaches();
    setMessage(`已删除示例账号「${account.displayName}」`);
    setBusy(false);
  };

  const promptRemoveLocal = (account: BoundAccount) => showActionNotification({
    title: '删除本地玩家',
    message: `将删除「${account.displayName}」及其本机成绩，且无法恢复。`,
    variant: 'warning',
    actions: [
      { label: '取消', tone: 'cancel' },
      { label: '删除', tone: 'destructive', onPress: () => removeLocalAccount(account) },
    ],
  });

  const promptRemoveDemo = (account: BoundAccount) => showActionNotification({
    title: '删除示例账号',
    message: `将移除「${account.displayName}」。之后可在添加菜单中重新加入示例查分器。`,
    variant: 'warning',
    actions: [
      { label: '取消', tone: 'cancel' },
      { label: '删除', tone: 'destructive', onPress: () => removeDemoAccount(account) },
    ],
  });

  const openPicker = () => {
    setExpandedPickerGameId('maimai');
    setPickerVisible(true);
  };

  const closePicker = () => setPickerVisible(false);

  const openLogin = (gameId: GameId, provider: ProviderOption) => {
    if (!provider.available) {
      showNotification({ title: provider.title, message: '绑定尚未实现，待后续开放。', variant: 'info' });
      return;
    }
    if (provider.id === 'local') {
      void addLocalAccount();
      return;
    }
    if (provider.id === 'maimai-test') {
      void addDemoAccount();
      return;
    }
    setExpandedPickerGameId(gameId);
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
    if (shouldReopen) InteractionManager.runAfterInteractions(() => setPickerVisible(true));
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

  const toggleGame = (gameId: GameId) => setCollapsedManagedGameIds((current) => {
    const next = new Set(current);
    if (next.has(gameId)) next.delete(gameId);
    else next.add(gameId);
    return next;
  });

  const renderAccountActions = (account: BoundAccount) => {
    const accountSession = sessionsByAccountId[account.id];
    const isActive = account.id === activeAccountId;
    const isLocal = account.providerId === 'local';
    const isGeneratedTest = account.providerId === 'maimai-test';
    const isRemote = account.providerId === 'diving-fish' || account.providerId === 'lxns';
    return (
      <>
        <Text style={[styles.game, { color: theme.textMuted }]}>
          {findGame(account.gameId)?.title} · {account.providerTitle}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {isLocal
            ? '数据位置：仅本机 SQLite'
            : isGeneratedTest
              ? '数据来源：曲库动态生成'
              : isRemote
                ? `登录方式：${sessionModeLabel(accountSession)}`
                : `数据来源：${account.providerTitle}`}
        </Text>
        <Text style={[styles.state, { color: theme.accent }]}>
          {isActive ? '当前使用中' : isLocal || isGeneratedTest ? '可随时删除' : '已绑定'}
        </Text>
        {!isActive ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`切换到 ${account.displayName}`}
            disabled={busy} onPress={() => onSelectAccount(account)}>
            <Text style={[styles.switch, { color: theme.accent }]}>切换到此账号</Text>
          </Pressable>
        ) : null}
        {isLocal ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`修改名称 ${account.displayName}`}
            disabled={busy} onPress={() => setRenameAccount(account)}>
            <Text style={[styles.rename, { color: theme.accent }]}>修改名称</Text>
          </Pressable>
        ) : null}
        {isLocal ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除本地玩家 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveLocal(account)}>
            <Text style={styles.unbind}>删除本地玩家</Text>
          </Pressable>
        ) : isGeneratedTest ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除示例账号 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveDemo(account)}>
            <Text style={styles.unbind}>删除示例账号</Text>
          </Pressable>
        ) : isRemote ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptUnbind(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : null}
      </>
    );
  };

  const loginProvider = loginProviderId ? findProvider(loginProviderId) ?? null : null;
  const loginGame = loginGameId ? findGame(loginGameId) : null;
  const loginVisible = loginProviderId !== null && !pickerVisible;

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(safeAreaInsets.bottom, 24) + 72 }]}
        scrollIndicatorInsets={{ bottom: safeAreaInsets.bottom }}>
        {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <BoundAccountGroupedList accounts={boundAccounts} expandedGameId={null}
          isGameExpanded={(gameId) => !collapsedManagedGameIds.has(gameId)}
          activeAccountId={activeAccountId} onToggleGame={toggleGame} onSelectAccount={onSelectAccount}
          renderActions={renderAccountActions}
          emptyText="暂无已绑定账号。点击右下角添加，展开游戏后选择查分器绑定。" />
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="添加游戏账号" disabled={busy} onPress={openPicker}
        style={({ pressed }) => [styles.fab, { bottom: Math.max(safeAreaInsets.bottom, 12) + 16, backgroundColor: theme.accent }, pressed && styles.fabPressed]}>
        <SymbolView name="plus" tintColor="#FFF" size={28} weight="semibold"
          fallback={<Ionicons name="add" size={28} color="#FFF" />} />
      </Pressable>

      <GamePickerSheet mode="bind" visible={pickerVisible} expandedGameId={expandedPickerGameId}
        onClose={closePicker} onToggleGame={toggleExpandedPickerGameId} onSelectProvider={openLogin}
        onSelectUnavailableGame={(title, detail) => showNotification({
          title, message: `${detail}，待后续开放。`, variant: 'info',
        })} />

      <ProviderLoginSheet visible={loginVisible} provider={loginProvider} gameTitle={loginGame?.title ?? ''}
        onClose={() => closeLogin({ reopenPicker: true })} onSuccess={finishLogin} />

      <RenameLocalAccountSheet visible={renameAccount !== null} initialName={renameAccount?.displayName ?? ''}
        onClose={() => setRenameAccount(null)} onSave={(displayName) => {
          if (!renameAccount) return Promise.resolve();
          return saveLocalAccountName(renameAccount, displayName);
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  gameGroup: { gap: 12 },
  gameGroupHeader: { minHeight: 34, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gameGroupTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  gameGroupSummary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gameGroupCount: { color: '#6B7280', fontSize: 12 },
  gameAccounts: { gap: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 18, gap: 8 },
  game: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  name: { color: '#111827', fontSize: 20, fontWeight: '700' },
  meta: { color: '#4B5563', fontSize: 14 },
  state: { color: '#246BFD', fontWeight: '600', marginTop: 4 },
  switch: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
  rename: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
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
