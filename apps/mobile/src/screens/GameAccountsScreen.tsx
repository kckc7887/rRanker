import { getDataSource } from '@rranker/sdk/registry';
import { accountIsAvailable } from '@rranker/sdk/state/account-store';
import { useVisibleBoundAccounts } from '@rranker/sdk/hooks/use-visible-bound-accounts';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GamePickerSheet } from '@rranker/sdk/components/GamePickerSheet';
import { ProviderLoginSheet } from '@rranker/sdk/components/ProviderLoginSheet';
import { RenameAccountSheet } from '@rranker/sdk/components/RenameAccountSheet';
import { BoundAccountGroupedList } from '@rranker/sdk/components/BoundAccountGroupedList';
import type { BoundAccount } from '@rranker/sdk/account';
import { canBindProvider, type GameId, type ProviderOption } from '@rranker/sdk/domain/game-bind-options';
import { useSession } from '@rranker/sdk/state/session-store';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { restoreAppAccounts, getAccountSourceStatuses, subscribeAccountSourceStatuses, retryFailedAccountSources } from '@rranker/sdk/services/account-restoration';
import { SecureSessionStore } from '@rranker/sdk/storage/secure-session-store';
import { useAppTheme } from '@rranker/sdk/theme/app-theme';
import { useAccountBindingFlow } from '@rranker/sdk/hooks/use-account-binding-flow';
import { useManagedAccountOperations } from '@rranker/sdk/hooks/use-managed-account-operations';
import { providerErrorToUserMessage } from '@rranker/sdk/providers/errors';
import { useAppLifecycle } from '@rranker/sdk/state/app-lifecycle';
import { recordRuntimeError } from '@rranker/sdk/services/runtime-diagnostics-recorder';

export function GameAccountsScreen() {
  const theme = useAppTheme();
  const { showNotification, showActionNotification } = useNotification();
  const boundAccounts = useVisibleBoundAccounts(true);
  const activeAccountId = useSession(s => s.activeAccountId);
  const restoreError = useSession(s => s.restoreError);
  const sourceStatuses = useSyncExternalStore(subscribeAccountSourceStatuses, getAccountSourceStatuses);
  const sourceFailed = sourceStatuses.some((source) => source.status === 'failed');
  const safeAreaInsets = useSafeAreaInsets();
  const testAccountsEnabled = useDebugStore(s => s.hydrated && s.testAccountsEnabled);
  const flow = useAccountBindingFlow();
  const { expandedPickerGameId, toggleExpandedPickerGameId, pickerVisible, loginVisible,
    loginProvider, loginGame,
    renameAccount, setRenameAccount, openPicker } = flow;
  const { busy, message, onSelectAccount, addAccount, promptRemoveAccount, renameAccount: saveAccountName } = useManagedAccountOperations(flow);
  const [collapsedManagedGameIds, setCollapsedManagedGameIds] = useState<Set<GameId>>(() => new Set());
  const [recovering, setRecovering] = useState(false);
  const recoveryLock = useRef(false);
  const mounted = useRef(true);
  const lifecycle = useAppLifecycle();
  const canNotify = useRef(lifecycle.phase !== 'background');
  canNotify.current = lifecycle.phase !== 'background';
  useEffect(() => () => { mounted.current = false; }, []);

  const recover = (action: () => Promise<void>) => {
    if (recoveryLock.current) return;
    recoveryLock.current = true;
    setRecovering(true);
    void action().catch(error => {
      recordRuntimeError('account-recovery', error, false, { phase: 'restore' });
      if (mounted.current && canNotify.current) {
        showNotification({ title: '恢复失败', message: providerErrorToUserMessage(error, '无法恢复本机账号，请稍后重试。'), variant: 'error' });
      }
    }).finally(() => {
      recoveryLock.current = false;
      if (mounted.current) setRecovering(false);
    });
  };

  const retryRestore = () => {
    recover(restoreAppAccounts);
  };

  const clearSessionsAndReload = () => {
    recover(async () => {
      try {
        const result = await new SecureSessionStore().clear();
        await restoreAppAccounts();
        if (mounted.current && canNotify.current) {
          showNotification({ title: '已清除登录数据',
            message: result.cleanupFailures.length ? `请重新绑定需要使用的账号。${result.cleanupFailures.join('、')}清理失败。` : '请重新绑定需要使用的账号。',
            variant: result.cleanupFailures.length ? 'warning' : 'info' });
        }
      } catch (error) {
        recordRuntimeError('account-recovery', error, false, { phase: 'clear' });
        if (mounted.current && canNotify.current) {
          showNotification({ title: '清除失败', message: providerErrorToUserMessage(error, '无法清除登录数据，请稍后重试。'), variant: 'error' });
        }
      }
    });
  };

  const confirmClearSessions = () => {
    showActionNotification({
      title: '清除登录数据',
      message: '将删除本机全部登录会话，之后需重新绑定账号。',
      variant: 'warning',
      actions: [
        { label: '清除', tone: 'destructive', onPress: clearSessionsAndReload },
        { label: '取消', tone: 'cancel' },
      ],
    });
  };

  const openLogin = (gameId: GameId, provider: ProviderOption) => {
    if (!provider.available) {
      showNotification({ title: provider.title, message: '请在插件管理中启用数据源和对应游戏。', variant: 'info' });
      return;
    }
    const debug = useDebugStore.getState();
    if (!canBindProvider(provider, debug.hydrated && debug.testAccountsEnabled)) return;
    const source = getDataSource(provider.id);
    if (source?.createAccount && !source.bindingSheet) { void addAccount(provider.id, gameId); return; }
    flow.openLogin(gameId, provider.id);
  };

  const toggleGame = (gameId: GameId) => setCollapsedManagedGameIds((current) => {
    const next = new Set(current);
    if (next.has(gameId)) next.delete(gameId);
    else next.add(gameId);
    return next;
  });

  const renderAccountActions = (account: BoundAccount) => {
    const source = account.providerId ? getDataSource(account.providerId) : undefined;
    const label = source?.bindingKind === 'fixture' ? '删除示例账号' : source?.bindingKind === 'local' ? '删除账号' : '解除绑定';
    return <>
      {account.id !== activeAccountId && accountIsAvailable(account) ? <Pressable disabled={busy} onPress={() => onSelectAccount(account)}>
        <Text style={[styles.switch, { color: theme.accent }]}>切换到此账号</Text>
      </Pressable> : null}
      {source?.renameAccount ? <Pressable disabled={busy} onPress={() => setRenameAccount(account)}>
        <Text style={[styles.rename, { color: theme.accent }]}>修改名称</Text>
      </Pressable> : null}
      <Pressable disabled={busy} onPress={() => promptRemoveAccount(account)}><Text style={styles.unbind}>{label}</Text></Pressable>
    </>;
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(safeAreaInsets.bottom, 24) + 72 }]}
        scrollIndicatorInsets={{ bottom: safeAreaInsets.bottom }}>
        {restoreError ? (
          <View>
            <Text style={styles.error}>{restoreError}</Text>
            <View style={styles.restoreActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="重试恢复登录状态"
                disabled={busy || recovering} onPress={retryRestore}>
                <Text style={styles.retryRestore}>重试恢复</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="清除登录数据并重新绑定"
                disabled={busy || recovering} onPress={confirmClearSessions}>
                <Text style={styles.clearSessions}>清除登录数据</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {sourceFailed ? <View>
          <Text style={styles.error}>部分本机账号暂时无法读取，已加载的账号可以继续使用。</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="重试读取账号" disabled={busy || recovering}
            onPress={() => recover(retryFailedAccountSources)}>
            <Text style={styles.retryRestore}>重试读取账号</Text>
          </Pressable>
        </View> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <BoundAccountGroupedList accounts={boundAccounts} expandedGameId={null}
          isGameExpanded={(gameId) => !collapsedManagedGameIds.has(gameId)}
          activeAccountId={activeAccountId} onToggleGame={toggleGame} onSelectAccount={onSelectAccount}
          renderActions={renderAccountActions}
          emptyText="暂无已绑定账号。点击右下角添加，展开游戏后选择查分器绑定。" />
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="添加游戏账号" disabled={busy} onPress={openPicker}
        style={({ pressed }) => [styles.fab, { bottom: Math.max(safeAreaInsets.bottom, 12) + 16, backgroundColor: theme.accent }, pressed && styles.fabPressed]}>
        <SymbolView name="plus" tintColor={theme.onAccent} size={28} weight="semibold"
          fallback={<Ionicons name="add" size={28} color={theme.onAccent} />} />
      </Pressable>

      <GamePickerSheet mode="bind" testAccountsEnabled={testAccountsEnabled} visible={pickerVisible} expandedGameId={expandedPickerGameId}
        onClose={flow.close} onToggleGame={toggleExpandedPickerGameId} onSelectProvider={openLogin}
        onSelectUnavailableGame={(title, detail) => showNotification({
          title, message: detail, variant: 'info',
        })} />

      <ProviderLoginSheet visible={loginVisible} provider={loginProvider}
        gameId={loginGame?.id ?? ''} gameTitle={loginGame?.title ?? ''}
        onClose={flow.closeLogin} onSuccess={flow.close} />

      <RenameAccountSheet visible={renameAccount !== null} initialName={renameAccount?.displayName ?? ''}
        maxLength={renameAccount?.providerId ? getDataSource(renameAccount.providerId)?.accountNameMaxLength : undefined}
        onClose={() => setRenameAccount(null)} onSave={(displayName) => {
          if (!renameAccount) return Promise.resolve();
          return saveAccountName(renameAccount, displayName);
        }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  switch: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
  rename: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
  unbind: { color: '#B42318', textAlign: 'center', paddingTop: 8 },
  message: { color: '#4B5563', fontSize: 13 },
  error: { color: '#B42318', fontSize: 13 },
  restoreActions: { flexDirection: 'row', gap: 16, paddingTop: 6 },
  retryRestore: { color: '#246BFD', fontWeight: '600' },
  clearSessions: { color: '#B42318' },
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
