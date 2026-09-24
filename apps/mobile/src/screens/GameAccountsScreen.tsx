import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GamePickerSheet } from '@/components/GamePickerSheet';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { TufPlayerPickerSheet } from '@/components/TufPlayerPickerSheet';
import { PhiraPlayerPickerSheet } from '@/components/PhiraPlayerPickerSheet';
import { MuseDashPlayerPickerSheet } from '@/components/MuseDashPlayerPickerSheet';
import { RenameLocalAccountSheet } from '@/components/RenameLocalAccountSheet';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import { OsuRatingTag } from '@/components/osu/OsuRatingTag';
import type { BoundAccount } from '@/domain/bound-account';
import { canBindProvider, isCredentialProvider, type GameId, type ProviderOption } from '@/domain/game-bind-options';
import { isOsuGameId } from '@/domain/game-mode-family';
import { useSession } from '@/state/session-store';
import { useDebugStore } from '@/state/debug-store';
import { useNotification } from '@/components/AppNotification';
import { restoreAppAccounts } from '@/services/account-restoration';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { useAppTheme } from '@/theme/app-theme';
import { useAccountBindingFlow } from '@/hooks/use-account-binding-flow';
import { useManagedAccountOperations } from '@/hooks/use-managed-account-operations';

export function GameAccountsScreen() {
  const theme = useAppTheme();
  const { showNotification, showActionNotification } = useNotification();
  const boundAccounts = useSession(s => s.boundAccounts);
  const activeAccountId = useSession(s => s.activeAccountId);
  const restoreError = useSession(s => s.restoreError);
  const safeAreaInsets = useSafeAreaInsets();
  const testAccountsEnabled = useDebugStore(s => s.hydrated && s.testAccountsEnabled);
  const flow = useAccountBindingFlow();
  const { expandedPickerGameId, toggleExpandedPickerGameId, pickerVisible, loginVisible,
    loginProvider, loginGame, tufPickerVisible, museDashPickerVisible, phiraPickerVisible,
    renameAccount, setRenameAccount, openPicker } = flow;
  const { busy, message, onSelectAccount, addLocalAccount, addDemoAccount, bindTufPlayer,
    bindPhiraPlayer, bindMuseDashPlayer, promptRemoveAccount, saveLocalAccountName } = useManagedAccountOperations(flow);
  const [collapsedManagedGameIds, setCollapsedManagedGameIds] = useState<Set<GameId>>(() => new Set());
  const [recovering, setRecovering] = useState(false);

  const retryRestore = () => {
    if (recovering) return;
    setRecovering(true);
    void restoreAppAccounts().finally(() => setRecovering(false));
  };

  const clearSessionsAndReload = () => {
    if (recovering) return;
    setRecovering(true);
    void (async () => {
      try {
        await new SecureSessionStore().clear();
        await restoreAppAccounts();
        showNotification({ title: '已清除登录数据', message: '请重新绑定需要使用的账号。', variant: 'info' });
      } finally {
        setRecovering(false);
      }
    })();
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
      showNotification({ title: provider.title, message: '绑定尚未实现，待后续开放。', variant: 'info' });
      return;
    }
    const debug = useDebugStore.getState();
    if (!canBindProvider(provider, debug.hydrated && debug.testAccountsEnabled)) return;
    if (provider.id === 'local') { void addLocalAccount(); return; }
    if (addDemoAccount(provider.id)) return;
    if (provider.bindingKind === 'public-player') { flow.openPublicPlayer(provider.id); return; }
    flow.openLogin(gameId, provider.id);
  };

  const toggleGame = (gameId: GameId) => setCollapsedManagedGameIds((current) => {
    const next = new Set(current);
    if (next.has(gameId)) next.delete(gameId);
    else next.add(gameId);
    return next;
  });

  const renderAccountActions = (account: BoundAccount) => {
    const isActive = account.id === activeAccountId;
    const isLocal = account.providerId === 'local';
    const isGeneratedTest = account.providerId === 'maimai-test'
      || account.providerId === 'chunithm-test'
      || account.providerId === 'phigros-test'
      || account.providerId === 'musedash-test';
    const isChunithmTemp = account.providerId === 'chunithm-temp';
    const isRemote = isCredentialProvider(account.providerId);
    const isTuf = account.providerId === 'tuf';
    const isMuseDash = account.providerId === 'musedash-moe';
    const isPhira = account.providerId === 'phira-community';
    return (
      <>
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
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>删除本地玩家</Text>
          </Pressable>
        ) : isGeneratedTest ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除示例账号 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>删除示例账号</Text>
          </Pressable>
        ) : isChunithmTemp ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除临时账号 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>删除临时账号</Text>
          </Pressable>
        ) : isTuf ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : isMuseDash ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : isPhira ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : isRemote ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveAccount(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : null}
      </>
    );
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
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <BoundAccountGroupedList accounts={boundAccounts} expandedGameId={null}
          isGameExpanded={(gameId) => !collapsedManagedGameIds.has(gameId)}
          activeAccountId={activeAccountId} onToggleGame={toggleGame} onSelectAccount={onSelectAccount}
          renderActions={renderAccountActions}
          renderRatingTag={(account) => (
            account.providerId === 'osu' && isOsuGameId(account.gameId)
              ? <OsuRatingTag display={account.scoreDisplay} />
              : null
          )}
          emptyText="暂无已绑定账号。点击右下角添加，展开游戏后选择查分器绑定。" />
      </ScrollView>

      <Pressable accessibilityRole="button" accessibilityLabel="添加游戏账号" disabled={busy} onPress={openPicker}
        style={({ pressed }) => [styles.fab, { bottom: Math.max(safeAreaInsets.bottom, 12) + 16, backgroundColor: theme.accent }, pressed && styles.fabPressed]}>
        <SymbolView name="plus" tintColor="#FFF" size={28} weight="semibold"
          fallback={<Ionicons name="add" size={28} color="#FFF" />} />
      </Pressable>

      <GamePickerSheet mode="bind" testAccountsEnabled={testAccountsEnabled} visible={pickerVisible} expandedGameId={expandedPickerGameId}
        onClose={flow.close} onToggleGame={toggleExpandedPickerGameId} onSelectProvider={openLogin}
        onSelectUnavailableGame={(title, detail) => showNotification({
          title, message: `${detail}，待后续开放。`, variant: 'info',
        })} />

      <ProviderLoginSheet visible={loginVisible} provider={loginProvider}
        gameId={loginGame?.id ?? 'maimai'} gameTitle={loginGame?.title ?? ''}
        onClose={flow.closeLogin} onSuccess={flow.close} />
      {tufPickerVisible ? <TufPlayerPickerSheet visible onClose={flow.close} onSelect={bindTufPlayer} /> : null}
      {museDashPickerVisible ? <MuseDashPlayerPickerSheet visible onClose={flow.close} onSelect={bindMuseDashPlayer} /> : null}
      {phiraPickerVisible ? <PhiraPlayerPickerSheet visible onClose={flow.close} onSelect={bindPhiraPlayer} /> : null}

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
