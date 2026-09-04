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
import { TufPlayerPickerSheet } from '@/components/TufPlayerPickerSheet';
import { PhiraPlayerPickerSheet } from '@/components/PhiraPlayerPickerSheet';
import { MuseDashPlayerPickerSheet } from '@/components/MuseDashPlayerPickerSheet';
import { RenameLocalAccountSheet } from '@/components/RenameLocalAccountSheet';
import { BoundAccountGroupedList } from '@/components/BoundAccountGroupedList';
import { OsuRatingTag } from '@/components/osu/OsuRatingTag';
import {
  createAdditionalLocalMaimaiAccountId,
  createLocalMaimaiAccount,
  createMaxedChunithmTestAccount,
  createMaxedMaimaiTestAccount,
  createMaxedMuseDashTestAccount,
  createMaxedPhigrosTestAccount,
  createMuseDashBoundAccount,
  createTufBoundAccount,
  createPhiraBoundAccount,
  phiraPlayerIdFromAccountId,
  museDashUserIdFromAccountId,
  osuUserIdFromAccountId,
  tufPlayerIdFromAccountId,
  MUSEDASH_TEST_USER_ID,
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
import { useGamePickerUi } from '@/state/game-picker-ui';
import { SecureSessionStore } from '@/storage/secure-session-store';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { OsuCache } from '@/services/osu-cache';
import { isOsuGameId } from '@/domain/game-mode-family';
import { queryClient } from '@/state/query-client';
import { UNBOUND_ACCOUNT_ID, useSession } from '@/state/session-store';
import { LocalAccountStore } from '@/storage/local-account-store';
import { DemoAccountStore } from '@/storage/demo-account-store';
import { ChunithmTempAccountStore } from '@/storage/chunithm-temp-account-store';
import { ChunithmDemoAccountStore } from '@/storage/chunithm-demo-account-store';
import { PhigrosDemoAccountStore } from '@/storage/phigros-demo-account-store';
import { MuseDashDemoAccountStore } from '@/storage/musedash-demo-account-store';
import { patchMaimaiPlayerDisplayName } from '@/services/invalidate-account-data';
import { providerErrorToUserMessage } from '@/providers/errors';
import { switchBoundAccount } from '@/services/switch-bound-account';
import { useNotification } from '@/components/AppNotification';
import { useAppTheme } from '@/theme/app-theme';
import { TufAccountStore } from '@/storage/tuf-account-store';
import { TufCache } from '@/services/tuf-cache';
import { MuseDashAccountStore } from '@/storage/musedash-account-store';
import { MuseDashCache } from '@/services/muse-dash-cache';
import { resolveTufAvatarUrl } from '@/domain/tuf';
import { PhiraAccountStore } from '@/storage/phira-account-store';
import { PhiraCache } from '@/services/phira-cache';
import {
  DEMO_REMOVE_COPY,
  LOCAL_REMOVE_COPY,
  PHIRA_UNBIND_COPY,
  REMOTE_UNBIND_COPY,
  addOrSwitchDemoAccount,
  bindOrSwitchPublicPlayer,
  formatPhiraRemovalMessage,
  formatPublicPlayerRemovalMessage,
  promptAccountRemoval,
  removeBoundPlayerAccount,
} from '@/screens/game-accounts-actions';

const sessions = new SecureSessionStore();
const snapshots = new SqliteSnapshotRepository();
const localAccounts = new LocalAccountStore();
const demoAccounts = new DemoAccountStore();
const chunithmDemoAccount = new ChunithmDemoAccountStore();
const phigrosDemoAccount = new PhigrosDemoAccountStore();
const museDashDemoAccount = new MuseDashDemoAccountStore();
const chunithmTempAccount = new ChunithmTempAccountStore();
const tufAccounts = new TufAccountStore();
const tufCache = new TufCache();
const museDashAccounts = new MuseDashAccountStore();
const museDashCache = new MuseDashCache();
const phiraAccounts = new PhiraAccountStore();
const phiraCache = new PhiraCache();
const osuCache = new OsuCache();

export function GameAccountsScreen() {
  const theme = useAppTheme();
  const { showActionNotification, showNotification } = useNotification();
  const boundAccounts = useSession((s) => s.boundAccounts);
  const activeAccountId = useSession((s) => s.activeAccountId);
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
  const [tufPickerVisible, setTufPickerVisible] = useState(false);
  const [museDashPickerVisible, setMuseDashPickerVisible] = useState(false);
  const [phiraPickerVisible, setPhiraPickerVisible] = useState(false);

  const [collapsedManagedGameIds, setCollapsedManagedGameIds] = useState<Set<GameId>>(() => new Set());

  const clearRemoteCaches = () => {
    for (const key of ['score-snapshot', 'game-data', 'songs', 'detailed-catalog', 'chunithm-catalog', 'plates']) {
      queryClient.removeQueries({ queryKey: [key] });
    }
  };

  const isLastGameAccount = (account: BoundAccount) => (
    boundAccounts.filter((item) => item.gameId === account.gameId).length === 1
  );

  const onSelectAccount = (account: BoundAccount) => {
    void Promise.resolve(switchBoundAccount(account.id, { navigateToOverview: false }))
      .catch(() => undefined);
  };

  const unbindAccount = async (account: BoundAccount, includePersonalData: boolean) => {
    setBusy(true);
    const failures: string[] = [];
    const attempt = async (label: string, action: () => Promise<unknown>) => {
      try { await action(); } catch { failures.push(label); }
    };
    await attempt('凭据', () => sessions.removeAccount(account.id));
    await attempt('缓存', () => snapshots.clear(account.id));
    if (account.providerId === 'osu' && isOsuGameId(account.gameId)) {
      const osuGameId = account.gameId;
      const userId = osuUserIdFromAccountId(account.id);
      if (userId !== null) {
        await attempt('模式缓存', () => osuCache.clear(osuGameId, userId));
      }
    }
    if (includePersonalData) await attempt('个人数据', () => library.clearGameUserData(account.gameId));
    removeBoundAccount(account.id);
    await attempt('当前账号', persistActiveAccountId);
    clearRemoteCaches();
    if (failures.length > 0) setMessage(`部分清除失败（${failures.join('、')}），其余项目已清除，请重试`);
    else setMessage(includePersonalData ? '已解除绑定并清除个人数据' : '已解除绑定；个人数据已保留');
    setBusy(false);
  };

  const promptUnbind = (account: BoundAccount) => promptAccountRemoval({
    isLast: isLastGameAccount(account),
    displayName: account.displayName,
    copy: REMOTE_UNBIND_COPY,
    onKeepPersonal: () => void unbindAccount(account, false),
    onClearPersonal: () => void unbindAccount(account, true),
    showActionNotification,
  });

  const promptRemoveTuf = (account: BoundAccount) => promptAccountRemoval({
    isLast: isLastGameAccount(account),
    displayName: account.displayName,
    copy: REMOTE_UNBIND_COPY,
    onKeepPersonal: () => void removeTufAccount(account, false),
    onClearPersonal: () => void removeTufAccount(account, true),
    showActionNotification,
  });

  const promptRemoveMuseDash = (account: BoundAccount) => promptAccountRemoval({
    isLast: isLastGameAccount(account),
    displayName: account.displayName,
    copy: REMOTE_UNBIND_COPY,
    onKeepPersonal: () => void removeMuseDashAccount(account, false),
    onClearPersonal: () => void removeMuseDashAccount(account, true),
    showActionNotification,
  });

  const promptRemovePhira = (account: BoundAccount) => promptAccountRemoval({
    isLast: isLastGameAccount(account),
    displayName: account.displayName,
    copy: PHIRA_UNBIND_COPY,
    onKeepPersonal: () => void removePhiraAccount(account, false),
    onClearPersonal: () => void removePhiraAccount(account, true),
    showActionNotification,
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
        void Promise.resolve(switchBoundAccount(account.id, { navigateToOverview: false }))
          .catch(() => undefined);
        setRenameAccount(account);
      });
    } catch (error) {
      showNotification({
        title: '添加失败',
        message: providerErrorToUserMessage(error, '无法添加本地玩家，请重试。'),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const demoAccountUi = {
    setBusy,
    setPickerVisible,
    setMessage,
    onSelectExisting: onSelectAccount,
    upsertBoundAccount,
    showNotification,
  };

  const addDemoAccount = () => addOrSwitchDemoAccount({
    ...demoAccountUi,
    existing: boundAccounts.find((account) => account.providerId === 'maimai-test'),
    create: createMaxedMaimaiTestAccount,
    persist: (account) => demoAccounts.upsert({ id: account.id, displayName: account.displayName }),
    existingMessage: (account) => `示例账号「${account.displayName}」已在列表中，已切换到该账号`,
    successMessage: (account) => `已添加示例账号「${account.displayName}」`,
    errorFallback: '无法添加示例账号，请重试。',
  });

  const addChunithmDemoAccount = () => addOrSwitchDemoAccount({
    ...demoAccountUi,
    existing: boundAccounts.find((account) => account.providerId === 'chunithm-test'),
    create: createMaxedChunithmTestAccount,
    persist: (account) => chunithmDemoAccount.save({ id: account.id, displayName: account.displayName }),
    existingMessage: (account) => `示例账号「${account.displayName}」已在列表中，已切换到该账号`,
    successMessage: (account) => `已添加中二节奏示例账号「${account.displayName}」`,
    errorFallback: '无法添加中二节奏示例账号，请重试。',
    afterFinally: () => { queryClient.removeQueries({ queryKey: ['tuf'] }); },
  });

  const bindTufPlayer = async (player: import('@/domain/tuf').TufPlayer) => {
    await bindOrSwitchPublicPlayer({
      existing: boundAccounts.find((account) => account.id === `adofai:tuf:${player.id}`),
      existingMessage: (account) => `TUF 玩家「${account.displayName}」已绑定，已切换到该玩家`,
      onExistingBound: () => setTufPickerVisible(false),
      create: () => createTufBoundAccount({
        playerId: player.id, displayName: player.name, avatarUrl: resolveTufAvatarUrl(player),
      }),
      persist: async (account) => {
        await tufAccounts.upsert({ playerId: player.id, displayName: player.name, avatarUrl: account.avatarUrl });
      },
      successMessage: () => `已绑定 TUF 玩家「${player.name}」`,
      onCreated: () => { setTufPickerVisible(false); setPickerVisible(false); },
      upsertBoundAccount,
      setMessage,
    });
  };

  const removeTufAccount = (account: BoundAccount, includePersonalData: boolean) => removeBoundPlayerAccount({
    includePersonalData,
    displayName: account.displayName,
    clearPlayer: async (attempt) => {
      const playerId = tufPlayerIdFromAccountId(account.id);
      if (playerId !== null) {
        await attempt('账号', () => tufAccounts.remove(playerId));
        await attempt('缓存', () => tufCache.clearPlayer(playerId));
      }
    },
    clearPersonalData: () => library.clearGameUserData(account.gameId),
    removeBoundAccount: () => removeBoundAccount(account.id),
    persistActive: persistActiveAccountId,
    afterRemove: () => { queryClient.removeQueries({ queryKey: ['tuf'] }); },
    formatMessage: (failures) => formatPublicPlayerRemovalMessage({
      failures, includePersonalData, displayName: account.displayName, gameLabel: 'TUF',
    }),
    setBusy,
    setMessage,
  });

  const bindPhiraPlayer = async (player: import('@/domain/phira').PhiraUser) => {
    await bindOrSwitchPublicPlayer({
      existing: undefined,
      existingMessage: (account) => `已绑定 Phira 玩家「${account.displayName}」`,
      onExistingBound: () => undefined,
      create: () => createPhiraBoundAccount({
        playerId: player.id, displayName: player.name, rks: player.rks, avatarUrl: player.avatar,
      }),
      persist: async () => {
        await phiraAccounts.upsert({ playerId: player.id, displayName: player.name, avatarUrl: player.avatar });
      },
      successMessage: () => `已绑定 Phira 玩家「${player.name}」`,
      onCreated: () => { setPhiraPickerVisible(false); setPickerVisible(false); },
      upsertBoundAccount,
      setMessage,
    });
  };

  const removePhiraAccount = (account: BoundAccount, includePersonalData: boolean) => removeBoundPlayerAccount({
    includePersonalData,
    displayName: account.displayName,
    clearPlayer: async (attempt) => {
      const playerId = phiraPlayerIdFromAccountId(account.id);
      if (playerId !== null) {
        await attempt('账号', () => phiraAccounts.remove(playerId));
        await attempt('缓存', () => phiraCache.clearPlayer(playerId));
      }
    },
    clearPersonalData: () => library.clearGameUserData(account.gameId),
    removeBoundAccount: () => removeBoundAccount(account.id),
    persistActive: persistActiveAccountId,
    afterRemove: () => { queryClient.removeQueries({ queryKey: ['phira'] }); },
    formatMessage: (failures) => formatPhiraRemovalMessage(failures, account.displayName),
    setBusy,
    setMessage,
  });

  const bindMuseDashPlayer = async (player: import('@/components/MuseDashPlayerPickerSheet').MuseDashSearchResult) => {
    await bindOrSwitchPublicPlayer({
      existing: boundAccounts.find((account) => account.id === `musedash:musedash-moe:${player.userId}`),
      existingMessage: (account) => `喵斯快跑玩家「${account.displayName}」已绑定，已切换到该玩家`,
      onExistingBound: () => setMuseDashPickerVisible(false),
      create: () => createMuseDashBoundAccount({ userId: player.userId, displayName: player.nickname }),
      persist: async () => {
        await museDashAccounts.upsert({ userId: player.userId, displayName: player.nickname });
      },
      successMessage: () => `已绑定喵斯快跑玩家「${player.nickname}」`,
      onCreated: () => { setMuseDashPickerVisible(false); setPickerVisible(false); },
      upsertBoundAccount,
      setMessage,
    });
  };

  const removeMuseDashAccount = (account: BoundAccount, includePersonalData: boolean) => removeBoundPlayerAccount({
    includePersonalData,
    displayName: account.displayName,
    clearPlayer: async (attempt) => {
      const userId = museDashUserIdFromAccountId(account.id);
      if (userId !== null) {
        await attempt('账号', () => museDashAccounts.remove(userId));
        await attempt('缓存', () => museDashCache.clearPlayer(userId));
      }
    },
    clearPersonalData: () => library.clearGameUserData(account.gameId),
    removeBoundAccount: () => removeBoundAccount(account.id),
    persistActive: persistActiveAccountId,
    afterRemove: () => { queryClient.removeQueries({ queryKey: ['musedash'] }); },
    formatMessage: (failures) => formatPublicPlayerRemovalMessage({
      failures, includePersonalData, displayName: account.displayName, gameLabel: '喵斯快跑',
    }),
    setBusy,
    setMessage,
  });

  const addPhigrosDemoAccount = () => addOrSwitchDemoAccount({
    ...demoAccountUi,
    existing: boundAccounts.find((account) => account.providerId === 'phigros-test'),
    create: createMaxedPhigrosTestAccount,
    persist: (account) => phigrosDemoAccount.save({ id: account.id, displayName: account.displayName }),
    existingMessage: (account) => `示例账号「${account.displayName}」已在列表中，已切换到该账号`,
    successMessage: (account) => `已添加 Phigros 示例账号「${account.displayName}」`,
    errorFallback: '无法添加 Phigros 示例账号，请重试。',
  });

  const addMuseDashDemoAccount = () => addOrSwitchDemoAccount({
    ...demoAccountUi,
    existing: boundAccounts.find((account) => account.providerId === 'musedash-test'),
    create: createMaxedMuseDashTestAccount,
    persist: (account) => museDashDemoAccount.save({ id: account.id, displayName: account.displayName }),
    existingMessage: (account) => `示例账号「${account.displayName}」已在列表中，已切换到该账号`,
    successMessage: (account) => `已添加喵斯快跑示例账号「${account.displayName}」`,
    errorFallback: '无法添加喵斯快跑示例账号，请重试。',
  });

  const saveLocalAccountName = async (account: BoundAccount, displayName: string) => {
    await localAccounts.upsert({ id: account.id, displayName });
    renameLocalAccount(account.id, displayName);
    patchMaimaiPlayerDisplayName(account.id, displayName, queryClient);
    setMessage(`已将本地玩家改名为「${displayName}」`);
  };

  async function persistActiveAccountId() {
    const nextId = useSession.getState().activeAccountId;
    if (!nextId || nextId === UNBOUND_ACCOUNT_ID) {
      await sessions.setActiveAccountId(null);
      return;
    }
    await sessions.setActiveAccountId(nextId);
  }

  const removeLocalAccount = async (account: BoundAccount, includePersonalData: boolean) => {
    setBusy(true);
    const failures: string[] = [];
    try { await localAccounts.remove(account.id); } catch { failures.push('账号'); }
    try { await snapshots.clear(account.id); } catch { failures.push('成绩'); }
    if (includePersonalData) {
      try { await library.clearGameUserData(account.gameId); } catch { failures.push('个人数据'); }
    }
    removeBoundAccount(account.id);
    try { await persistActiveAccountId(); } catch { failures.push('当前账号'); }
    clearRemoteCaches();
    setMessage(failures.length > 0
      ? `本地玩家已从列表移除，但${failures.join('、')}数据清理失败`
      : `已删除本地玩家「${account.displayName}」`);
    setBusy(false);
  };

  const removeDemoAccount = async (account: BoundAccount, includePersonalData: boolean) => {
    setBusy(true);
    const failures: string[] = [];
    try {
      if (account.providerId === 'chunithm-test') await chunithmDemoAccount.remove();
      else if (account.providerId === 'phigros-test') await phigrosDemoAccount.remove();
      else if (account.providerId === 'musedash-test') {
        await museDashDemoAccount.remove();
        await museDashCache.clearPlayer(MUSEDASH_TEST_USER_ID);
      }
      else await demoAccounts.remove(account.id);
    } catch {
      failures.push('账号');
    }
    if (includePersonalData) {
      try { await library.clearGameUserData(account.gameId); } catch { failures.push('个人数据'); }
    }
    removeBoundAccount(account.id);
    try { await persistActiveAccountId(); } catch { failures.push('当前账号'); }
    clearRemoteCaches();
    if (account.providerId === 'musedash-test') {
      queryClient.removeQueries({ queryKey: ['musedash'] });
    }
    setMessage(failures.length > 0
      ? `示例账号已从列表移除，但${failures.join('、')}清理失败`
      : `已删除示例账号「${account.displayName}」`);
    setBusy(false);
  };

  const removeChunithmTempAccount = async (account: BoundAccount) => {
    setBusy(true);
    const failures: string[] = [];
    try { await chunithmTempAccount.remove(); } catch { failures.push('账号'); }
    removeBoundAccount(account.id);
    try { await persistActiveAccountId(); } catch { failures.push('当前账号'); }
    clearRemoteCaches();
    setMessage(failures.length > 0
      ? `临时账号已从列表移除，但${failures.join('、')}清理失败`
      : '已删除中二节奏临时账号');
    setBusy(false);
  };

  const promptRemoveLocal = (account: BoundAccount) => promptAccountRemoval({
    isLast: isLastGameAccount(account),
    displayName: account.displayName,
    copy: LOCAL_REMOVE_COPY,
    onKeepPersonal: () => void removeLocalAccount(account, false),
    onClearPersonal: () => void removeLocalAccount(account, true),
    showActionNotification,
  });

  const promptRemoveDemo = (account: BoundAccount) => promptAccountRemoval({
    isLast: isLastGameAccount(account),
    displayName: account.displayName,
    copy: DEMO_REMOVE_COPY,
    onKeepPersonal: () => void removeDemoAccount(account, false),
    onClearPersonal: () => void removeDemoAccount(account, true),
    showActionNotification,
  });

  const promptRemoveChunithmTemp = (account: BoundAccount) => showActionNotification({
    title: '删除临时账号',
    message: '将移除中二节奏临时账号，之后可重新添加。',
    variant: 'warning',
    actions: [
      { label: '取消', tone: 'cancel' },
      { label: '确认删除', tone: 'destructive', onPress: () => removeChunithmTempAccount(account) },
    ],
  });

  const openPicker = () => {
    setExpandedPickerGameId(null);
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
    if (provider.id === 'chunithm-test') {
      void addChunithmDemoAccount();
      return;
    }
    if (provider.id === 'phigros-test') {
      void addPhigrosDemoAccount();
      return;
    }
    if (provider.id === 'musedash-test') {
      void addMuseDashDemoAccount();
      return;
    }
    if (provider.bindingKind === 'public-player') {
      setPickerVisible(false);
      if (provider.id === 'musedash-moe') setMuseDashPickerVisible(true);
      else if (provider.id === 'phira-community') setPhiraPickerVisible(true);
      else setTufPickerVisible(true);
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
    const isRemote = account.providerId === 'diving-fish' || account.providerId === 'lxns' || account.providerId === 'phi-taptap' || account.providerId === 'osu';
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
            disabled={busy} onPress={() => promptRemoveLocal(account)}>
            <Text style={styles.unbind}>删除本地玩家</Text>
          </Pressable>
        ) : isGeneratedTest ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除示例账号 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveDemo(account)}>
            <Text style={styles.unbind}>删除示例账号</Text>
          </Pressable>
        ) : isChunithmTemp ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`删除临时账号 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveChunithmTemp(account)}>
            <Text style={styles.unbind}>删除临时账号</Text>
          </Pressable>
        ) : isTuf ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveTuf(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : isMuseDash ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemoveMuseDash(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
          </Pressable>
        ) : isPhira ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`解除绑定 ${account.displayName}`}
            disabled={busy} onPress={() => promptRemovePhira(account)}>
            <Text style={styles.unbind}>解除绑定</Text>
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

      <GamePickerSheet mode="bind" visible={pickerVisible} expandedGameId={expandedPickerGameId}
        onClose={closePicker} onToggleGame={toggleExpandedPickerGameId} onSelectProvider={openLogin}
        onSelectUnavailableGame={(title, detail) => showNotification({
          title, message: `${detail}，待后续开放。`, variant: 'info',
        })} />

      <ProviderLoginSheet visible={loginVisible} provider={loginProvider}
        gameId={loginGame?.id ?? 'maimai'} gameTitle={loginGame?.title ?? ''}
        onClose={() => closeLogin({ reopenPicker: true })} onSuccess={finishLogin} />
      {tufPickerVisible ? <TufPlayerPickerSheet visible onClose={() => setTufPickerVisible(false)} onSelect={bindTufPlayer} /> : null}
      {museDashPickerVisible ? <MuseDashPlayerPickerSheet visible onClose={() => setMuseDashPickerVisible(false)} onSelect={bindMuseDashPlayer} /> : null}
      {phiraPickerVisible ? <PhiraPlayerPickerSheet visible onClose={() => setPhiraPickerVisible(false)} onSelect={bindPhiraPlayer} /> : null}

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
