import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { RenameLocalAccountSheet } from '@/components/RenameLocalAccountSheet';
import {
  createAdditionalLocalMaimaiAccountId,
  createLocalMaimaiAccount,
  LOCAL_MAIMAI_ACCOUNT_ID,
  type BoundAccount,
} from '@/domain/bound-account';
import {
  GAME_OPTIONS,
  findGame,
  findProvider,
  type GameId,
  type ProviderId,
  type ProviderOption,
} from '@/domain/game-bind-options';
import { useNativeTabBottomInset } from '@/hooks/use-native-tab-bottom-inset';
import { useUserLibrary } from '@/hooks/use-user-library';
import type { ProviderSession } from '@/providers/contracts';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { LocalAccountStore } from '@/storage/local-account-store';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { useNotification } from '@/components/AppNotification';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();
const localAccounts = new LocalAccountStore();

function sessionModeLabel(session: ProviderSession | undefined): string {
  if (!session) return '无凭据';
  if (session.mode === 'jwt') return '仅登录（不可上传）';
  if (session.mode === 'import-token') return '已可上传';
  if (session.mode === 'lxns-oauth') return 'OAuth（可上传）';
  return 'Cookie（当前会话）';
}

export default function GameAccountsScreen() {
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
  const tabBottomInset = useNativeTabBottomInset();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedGameId, setExpandedGameId] = useState<GameId | null>('maimai');
  const [loginProviderId, setLoginProviderId] = useState<ProviderId | null>(null);
  const [loginGameId, setLoginGameId] = useState<GameId | null>(null);
  const [renameAccount, setRenameAccount] = useState<BoundAccount | null>(null);

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
      const account = createLocalMaimaiAccount(
        `本地玩家 ${localCount + 1}`,
        0,
        createAdditionalLocalMaimaiAccountId(boundAccounts.map((item) => item.id)),
      );
      await localAccounts.upsert({ id: account.id, displayName: account.displayName });
      upsertBoundAccount(account);
      selectBoundAccount(account.id);
      await sessions.setActiveAccountId(account.id);
      setRenameAccount(account);
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

  const saveLocalAccountName = async (account: BoundAccount, displayName: string) => {
    await localAccounts.upsert({ id: account.id, displayName });
    renameLocalAccount(account.id, displayName);
    await invalidateAccountDataQueries(queryClient);
    setMessage(`已将本地玩家改名为「${displayName}」`);
  };

  const removeLocalAccount = async (account: BoundAccount) => {
    setBusy(true);
    const failures: string[] = [];
    try { await localAccounts.remove(account.id); } catch { failures.push('账号'); }
    try { await snapshots.clear(account.id); } catch { failures.push('成绩'); }
    removeBoundAccount(account.id);
    if (account.id === activeAccountId) {
      selectBoundAccount(LOCAL_MAIMAI_ACCOUNT_ID);
      await sessions.setActiveAccountId(LOCAL_MAIMAI_ACCOUNT_ID);
    }
    clearRemoteCaches();
    setMessage(failures.length > 0
      ? `本地玩家已从列表移除，但${failures.join('、')}数据清理失败`
      : `已删除本地玩家「${account.displayName}」`);
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
      const account = boundAccounts.find((item) => item.providerId === provider.id);
      if (account) onSelectAccount(account);
      return;
    }
    setLoginGameId(gameId);
    setLoginProviderId(provider.id);
  };

  const closeLogin = () => {
    setLoginProviderId(null);
    setLoginGameId(null);
  };

  const finishLogin = () => {
    setLoginProviderId(null);
    setLoginGameId(null);
  };

  const onSelectAccount = (account: BoundAccount) => {
    selectBoundAccount(account.id);
    void sessions.setActiveAccountId(account.id);
  };

  const renderAccountCard = (account: BoundAccount) => {
    const accountSession = sessionsByAccountId[account.id];
    const isActive = account.id === activeAccountId;
    const isLocal = account.providerId === 'local';
    const isGeneratedTest = account.providerId === 'maimai-test';
    return (
      <View key={account.id} style={styles.card} testID={`account-${account.id}`}>
        <Text style={styles.name}>{account.displayName}</Text>
        <Text style={styles.meta}>{account.scoreLabel} {account.scoreDisplay || '—'}</Text>
        <Text style={styles.meta}>
          {isLocal
            ? '数据位置：仅本机 SQLite'
            : isGeneratedTest
              ? '数据来源：曲库动态生成'
              : account.providerId
                ? `登录方式：${sessionModeLabel(accountSession)}`
                : `数据来源：${account.providerTitle}`}
        </Text>
        <Text style={styles.state}>{isActive ? '当前使用中' : isLocal || isGeneratedTest ? '内置账号' : '已绑定'}</Text>
        {!isActive ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`切换到 ${account.displayName}`}
            disabled={busy} onPress={() => onSelectAccount(account)}>
            <Text style={styles.switch}>切换到此账号</Text>
          </Pressable>
        ) : null}
        {isLocal ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`修改名称 ${account.displayName}`}
            disabled={busy} onPress={() => setRenameAccount(account)}>
            <Text style={styles.rename}>修改名称</Text>
          </Pressable>
        ) : null}
        {isLocal && account.id !== LOCAL_MAIMAI_ACCOUNT_ID ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除本地玩家 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveLocal(account)}>
            <Text style={styles.unbind}>删除本地玩家</Text>
          </Pressable>
        ) : !isLocal && !isGeneratedTest && account.providerId ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptUnbind(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const loginProvider = loginProviderId ? findProvider(loginProviderId) ?? null : null;
  const loginGame = loginGameId ? findGame(loginGameId) : null;
  const loginVisible = loginProviderId !== null;

  return (
    <View style={styles.page}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, { paddingBottom: tabBottomInset + 24 }]}
        scrollIndicatorInsets={{ bottom: tabBottomInset }}
      >
        {restoreError ? <Text style={styles.error}>{restoreError}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {GAME_OPTIONS.map((game) => {
          const expanded = expandedGameId === game.id;
          const gameAccounts = boundAccounts.filter((account) => account.gameId === game.id);
          return (
            <View key={game.id} style={[styles.gameSection, !game.available && styles.gameSectionDisabled]}
              testID={`game-section-${game.id}`}>
              <Pressable accessibilityRole="button"
                accessibilityLabel={game.available ? `${expanded ? '收起' : '展开'}游戏 ${game.title}` : `${game.title} 尚未开放`}
                accessibilityState={game.available ? { expanded } : { disabled: true }}
                onPress={() => {
                  if (!game.available) {
                    showNotification({ title: game.title, message: `${game.pendingDetail}，待后续开放。`, variant: 'info' });
                    return;
                  }
                  setExpandedGameId((current) => current === game.id ? null : game.id);
                }}
                style={({ pressed }) => [styles.gameHeader, pressed && game.available && styles.rowPressed]}>
                <Image source={game.icon} style={styles.gameIcon} />
                <View style={styles.gameCopy}>
                  <Text style={[styles.gameName, !game.available && styles.disabledText]}>{game.title}</Text>
                  <Text style={styles.gameDetail}>
                    {game.available
                      ? game.providers.length > 0
                        ? `${game.providers.length} 个查分器 · ${gameAccounts.length} 个账号`
                        : `${gameAccounts.length} 个账号 · 无需查分器`
                      : game.pendingDetail}
                  </Text>
                </View>
                {game.available ? (
                  <SymbolView name={expanded ? 'chevron.up' : 'chevron.down'} tintColor="#6B7280" size={18}
                    fallback={<Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />} />
                ) : <Text style={styles.pending}>待开放</Text>}
              </Pressable>

              {expanded && game.available ? (
                <View style={styles.gameBody}>
                  {game.providers.length > 0 ? game.providers.map((provider) => {
                    const providerAccounts = gameAccounts.filter((account) => account.providerId === provider.id);
                    const actionLabel = provider.id === 'local'
                      ? '添加玩家'
                      : provider.id === 'maimai-test'
                        ? '使用账号'
                        : providerAccounts.length > 0 ? '绑定其他账号' : '绑定账号';
                    return (
                      <View key={provider.id} style={styles.providerSection} testID={`provider-section-${provider.id}`}>
                        <View style={styles.providerHeader}>
                          <Image source={provider.icon} style={styles.providerIcon} />
                          <View style={styles.providerCopy}>
                            <Text style={styles.providerName}>{provider.title}</Text>
                            <Text style={styles.providerDetail}>{provider.detail}</Text>
                          </View>
                          <Pressable accessibilityRole="button" accessibilityLabel={`添加账号 ${provider.title}`}
                            disabled={busy || !provider.available} onPress={() => openLogin(game.id, provider)}
                            style={({ pressed }) => [styles.providerAction, pressed && styles.rowPressed]}>
                            <Text style={styles.providerActionText}>{actionLabel}</Text>
                          </Pressable>
                        </View>
                        {providerAccounts.length > 0 ? (
                          <View style={styles.accountList} testID={`provider-accounts-${provider.id}`}>
                            {providerAccounts.map(renderAccountCard)}
                          </View>
                        ) : <Text style={styles.providerEmpty}>尚未绑定账号</Text>}
                      </View>
                    );
                  }) : (
                    <View style={styles.providerSection}>
                      <Text style={styles.noProvider}>此游戏无需绑定查分器</Text>
                      {gameAccounts.length > 0
                        ? <View style={styles.accountList}>{gameAccounts.map(renderAccountCard)}</View>
                        : <Text style={styles.providerEmpty}>暂无账号</Text>}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <ProviderLoginSheet
        visible={loginVisible}
        provider={loginProvider}
        gameTitle={loginGame?.title ?? ''}
        onClose={closeLogin}
        onSuccess={finishLogin}
      />

      <RenameLocalAccountSheet
        visible={renameAccount !== null}
        initialName={renameAccount?.displayName ?? ''}
        onClose={() => setRenameAccount(null)}
        onSave={(displayName) => {
          if (!renameAccount) return Promise.resolve();
          return saveLocalAccountName(renameAccount, displayName);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 16, gap: 12 },
  gameSection: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
  gameSectionDisabled: { opacity: 0.72 },
  gameHeader: { minHeight: 76, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  gameIcon: { width: 46, height: 46, borderRadius: 10, backgroundColor: '#F3F4F6' },
  gameCopy: { flex: 1, minWidth: 0, gap: 3 },
  gameName: { color: '#111827', fontSize: 17, fontWeight: '700' },
  gameDetail: { color: '#6B7280', fontSize: 12, lineHeight: 17 },
  disabledText: { color: '#6B7280' },
  pending: { color: '#9CA3AF', fontSize: 12, fontWeight: '700' },
  gameBody: { padding: 12, paddingTop: 0, gap: 10 },
  providerSection: { borderRadius: 13, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', padding: 12, gap: 10 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFF' },
  providerCopy: { flex: 1, minWidth: 0, gap: 2 },
  providerName: { color: '#111827', fontSize: 14, fontWeight: '700' },
  providerDetail: { color: '#6B7280', fontSize: 11, lineHeight: 15 },
  providerAction: { minHeight: 32, borderRadius: 16, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1FF' },
  providerActionText: { color: '#1D4ED8', fontSize: 12, fontWeight: '700' },
  providerEmpty: { color: '#9CA3AF', fontSize: 12, paddingLeft: 46 },
  noProvider: { color: '#4B5563', fontSize: 13, fontWeight: '600' },
  accountList: { gap: 8 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 14, gap: 7, borderWidth: 1, borderColor: '#E5E7EB' },
  name: { color: '#111827', fontSize: 17, fontWeight: '700' },
  meta: { color: '#4B5563', fontSize: 14 },
  state: { color: '#246BFD', fontWeight: '600', marginTop: 4 },
  switch: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
  rename: { color: '#246BFD', textAlign: 'center', paddingTop: 8, fontWeight: '600' },
  unbind: { color: '#B42318', textAlign: 'center', paddingTop: 8 },
  message: { color: '#4B5563', fontSize: 13 },
  error: { color: '#B42318', fontSize: 13 },
  rowPressed: { opacity: 0.76 },
});
