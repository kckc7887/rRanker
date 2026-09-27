import { useState } from 'react';
import { useNotification } from '@/components/AppNotification';
import type { BoundAccount } from '@/domain/bound-account';
import type { ProviderId } from '@/domain/game-bind-options';
import { providerErrorToUserMessage } from '@/providers/errors';
import { useSession } from '@/state/session-store';
import { queryClient } from '@/state/query-client';
import { switchBoundAccount } from '@/services/switch-bound-account';
import {
  clearBoundAccountData, createLocalBoundAccount, demoAccountBinding,
  museDashPlayerBinding, persistActiveAccountId, phiraPlayerBinding,
  saveLocalAccountName, tufPlayerBinding,
} from '@/services/account-management';
import {
  addOrSwitchDemoAccount, bindOrSwitchPublicPlayer, cancelBoundAccountQueries,
  DEMO_REMOVE_COPY, LOCAL_REMOVE_COPY, PHIRA_UNBIND_COPY, REMOTE_UNBIND_COPY,
  formatPhiraRemovalMessage, formatPublicPlayerRemovalMessage,
  promptAccountRemoval, removeBoundPlayerAccount,
} from '@/screens/game-accounts-actions';
import { useUserLibrary } from '@/hooks/use-user-library';
import type { useAccountBindingFlow } from '@/hooks/use-account-binding-flow';

export function useManagedAccountOperations(flow: ReturnType<typeof useAccountBindingFlow>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { showNotification, showActionNotification } = useNotification();
  const library = useUserLibrary();
  const accounts = useSession(s => s.boundAccounts);
  const upsertBoundAccount = useSession(s => s.upsertBoundAccount);
  const onSelectAccount = (account: BoundAccount) => {
    void Promise.resolve(switchBoundAccount(account.id, { navigateToOverview: false })).catch(() => undefined);
  };
  const addLocalAccount = async () => {
    setBusy(true);
    try {
      const account = await createLocalBoundAccount(accounts);
      upsertBoundAccount(account);
      flow.afterClose(() => { onSelectAccount(account); flow.setRenameAccount(account); });
    } catch (error) {
      showNotification({ title: '添加失败', message: providerErrorToUserMessage(error, '无法添加本地玩家，请重试。'), variant: 'error' });
    } finally { setBusy(false); }
  };
  const addDemoAccount = (providerId: ProviderId) => {
    const binding = demoAccountBinding(providerId);
    if (!binding) return false;
    void addOrSwitchDemoAccount({
      ...binding, existing: accounts.find(account => account.providerId === providerId),
      existingMessage: account => `示例账号「${account.displayName}」已在列表中，已切换到该账号`,
      successMessage: account => `已添加${binding.label}示例账号「${account.displayName}」`,
      errorFallback: `无法添加${binding.label}示例账号，请重试。`,
      setBusy, setMessage, setPickerVisible: flow.setPickerVisible,
      onSelectExisting: onSelectAccount, upsertBoundAccount, showNotification,
    });
    return true;
  };
  const bindTufPlayer = (player: import('@/domain/tuf').TufPlayer) => {
    const binding = tufPlayerBinding(player);
    return bindOrSwitchPublicPlayer({ ...binding,
      existing: accounts.find(account => account.id === binding.id),
      existingMessage: account => `TUF 玩家「${account.displayName}」已绑定，已切换到该玩家`,
      successMessage: () => `已绑定 TUF 玩家「${player.name}」`,
      onExistingBound: flow.close, onCreated: flow.close, upsertBoundAccount, setMessage,
    });
  };
  const bindPhiraPlayer = (player: import('@/domain/phira').PhiraUser) => bindOrSwitchPublicPlayer({
    ...phiraPlayerBinding(player), existing: undefined,
    existingMessage: account => `已绑定 Phira 玩家「${account.displayName}」`,
    successMessage: () => `已绑定 Phira 玩家「${player.name}」`,
    onExistingBound: flow.close, onCreated: flow.close, upsertBoundAccount, setMessage,
  });
  const bindMuseDashPlayer = (player: { userId: string; nickname: string }) => {
    const binding = museDashPlayerBinding(player);
    return bindOrSwitchPublicPlayer({ ...binding,
      existing: accounts.find(account => account.id === binding.id),
      existingMessage: account => `喵斯快跑玩家「${account.displayName}」已绑定，已切换到该玩家`,
      successMessage: () => `已绑定喵斯快跑玩家「${player.nickname}」`,
      onExistingBound: flow.close, onCreated: flow.close, upsertBoundAccount, setMessage,
    });
  };
  const removalMessage = (account: BoundAccount, includePersonalData: boolean, failures: readonly string[]) => {
    if (account.providerId === 'local') return failures.length
      ? `本地玩家已从列表移除，但${failures.join('、')}数据清理失败` : `已删除本地玩家「${account.displayName}」`;
    if (demoAccountBinding(account.providerId)) return failures.length
      ? `示例账号已从列表移除，但${failures.join('、')}清理失败` : `已删除示例账号「${account.displayName}」`;
    if (account.providerId === 'chunithm-temp') return failures.length
      ? `临时账号已从列表移除，但${failures.join('、')}清理失败` : '已删除中二节奏临时账号';
    if (account.providerId === 'phira-community') return formatPhiraRemovalMessage(failures, account.displayName);
    if (account.providerId === 'tuf' || account.providerId === 'musedash-moe') return formatPublicPlayerRemovalMessage({
      failures, includePersonalData, displayName: account.displayName, gameLabel: account.providerId === 'tuf' ? 'TUF' : '喵斯快跑',
    });
    return failures.length ? `部分清除失败（${failures.join('、')}），其余项目已清除，请重试`
      : includePersonalData ? '已解除绑定并清除个人数据' : '已解除绑定；个人数据已保留';
  };
  const removeAccount = (account: BoundAccount, includePersonalData: boolean) => removeBoundPlayerAccount({
    includePersonalData, displayName: account.displayName,
    prepareRemoval: () => cancelBoundAccountQueries(account, queryClient),
    clearPlayer: attempts => clearBoundAccountData(account, attempts),
    clearPersonalData: () => library.clearGameUserData(account.gameId),
    removeBoundAccount: () => useSession.getState().removeBoundAccount(account.id),
    persistActive: persistActiveAccountId,
    formatMessage: failures => removalMessage(account, includePersonalData, failures),
    setBusy, setMessage, showNotification,
  });
  const promptRemoveAccount = (account: BoundAccount) => {
    if (account.providerId === 'chunithm-temp') {
      showActionNotification({ title: '删除临时账号', message: '将移除中二节奏临时账号，之后可重新添加。', variant: 'warning',
        actions: [{ label: '取消', tone: 'cancel' }, { label: '确认删除', tone: 'destructive', onPress: () => void removeAccount(account, false) }] });
      return;
    }
    promptAccountRemoval({
      isLast: accounts.filter(item => item.gameId === account.gameId).length === 1,
      displayName: account.displayName,
      copy: account.providerId === 'local' ? LOCAL_REMOVE_COPY : demoAccountBinding(account.providerId) ? DEMO_REMOVE_COPY
        : account.providerId === 'phira-community' ? PHIRA_UNBIND_COPY : REMOTE_UNBIND_COPY,
      onKeepPersonal: () => void removeAccount(account, false),
      onClearPersonal: () => void removeAccount(account, true), showActionNotification,
    });
  };
  return { busy, message, onSelectAccount, addLocalAccount, addDemoAccount, bindTufPlayer, bindPhiraPlayer, bindMuseDashPlayer, promptRemoveAccount,
    saveLocalAccountName: async (account: BoundAccount, displayName: string) => {
      await saveLocalAccountName(account, displayName);
      setMessage(`已将本地玩家改名为「${displayName}」`);
    },
  };
}
