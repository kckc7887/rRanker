import { captureResourceWrites, subscribeResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { useState } from 'react';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import type { BoundAccount } from '@rranker/sdk/account';
import type { GameId, ProviderId } from '@rranker/sdk/plugins';
import { getDataSource, isPluginAvailable } from '@rranker/sdk/registry';
import { providerErrorToUserMessage } from '@rranker/sdk/providers/errors';
import { useSession } from '@rranker/sdk/state/session-store';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { queryClient } from '@rranker/sdk/state/query-client';
import { notifyAccountSwitchError, switchBoundAccount } from '@rranker/sdk/services/switch-bound-account';
import { clearBoundAccountData, persistActiveAccountId } from '@rranker/sdk/services/account-management';
import { DEMO_REMOVE_COPY, LOCAL_REMOVE_COPY, REMOTE_UNBIND_COPY, promptAccountRemoval,
  removeBoundPlayerAccount } from '@rranker/sdk/screens/game-accounts-actions';
import { cancelBoundAccountQueries } from '@rranker/sdk/services/invalidate-account-data';
import { useUserLibrary } from '@rranker/sdk/hooks/use-user-library';
import type { useAccountBindingFlow } from './use-account-binding-flow';

export function useManagedAccountOperations(flow: ReturnType<typeof useAccountBindingFlow>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const { showNotification, showActionNotification } = useNotification();
  const library = useUserLibrary();
  const accounts = useSession(state => state.boundAccounts);
  const onSelectAccount = async (account: BoundAccount) => {
    try { return await switchBoundAccount(account.id, { navigateToOverview: false }); }
    catch (error) { notifyAccountSwitchError(error, showNotification); return false; }
  };
  const addAccount = async (providerId: ProviderId, gameId: GameId) => {
    const source = getDataSource(providerId);
    if (!source?.createAccount || !isPluginAvailable(source.id, gameId)) return;
    const debug = useDebugStore.getState();
    if (source.bindingKind === 'fixture' && !(debug.hydrated && debug.testAccountsEnabled)) return;
    const controller = new AbortController();
    const sourceCurrent = captureResourceWrites(source.id, controller.signal);
    const gameCurrent = captureResourceWrites(gameId, controller.signal);
    const assertCurrent = () => { sourceCurrent(); gameCurrent();
      if (!isPluginAvailable(source.id, gameId)) throw new Error('来源已停用'); };
    const subscriptions = [source.id, gameId].map(scope => subscribeResourceWrites(scope, () => controller.abort()));
    setBusy(true);
    try {
      const account = await source.createAccount(gameId, accounts, assertCurrent);
      assertCurrent();
      useSession.getState().upsertBoundAccount(account);
      flow.afterClose(() => {
        void onSelectAccount(account).then(selected => {
          if (!selected) return;
          setMessage(`已添加账号「${account.displayName}」`);
          if (source.renameAccount) flow.setRenameAccount(account);
        });
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      showNotification({ title: '添加失败', message: providerErrorToUserMessage(error, '无法添加账号，请重试。'), variant: 'error' });
    } finally { for (const unsubscribe of subscriptions) unsubscribe(); setBusy(false); }
  };
  const removeAccount = (account: BoundAccount, includePersonalData: boolean) => removeBoundPlayerAccount({
    includePersonalData, displayName: account.displayName,
    prepareRemoval: () => cancelBoundAccountQueries(account, queryClient),
    clearPlayer: attempts => clearBoundAccountData(account, attempts),
    clearPersonalData: () => library.clearGameUserData(account.gameId),
    removeBoundAccount: () => useSession.getState().removeBoundAccount(account.id), persistActive: persistActiveAccountId,
    formatMessage: failures => failures.length ? `账号已移除，但${failures.join('、')}清理失败`
      : includePersonalData ? '已解除绑定并清除个人数据' : '已解除绑定；个人数据已保留',
    setBusy, setMessage, showNotification,
  });
  const promptRemoveAccount = (account: BoundAccount) => {
    const source = account.providerId ? getDataSource(account.providerId) : undefined;
    promptAccountRemoval({ isLast: accounts.filter(item => item.gameId === account.gameId).length === 1,
      displayName: account.displayName,
      copy: source?.bindingKind === 'local' ? LOCAL_REMOVE_COPY : source?.bindingKind === 'fixture' ? DEMO_REMOVE_COPY : REMOTE_UNBIND_COPY,
      onKeepPersonal: () => void removeAccount(account, false), onClearPersonal: () => void removeAccount(account, true), showActionNotification });
  };
  return { busy, message, onSelectAccount, addAccount, promptRemoveAccount,
    renameAccount: async (account: BoundAccount, displayName: string) => {
      const source = account.providerId ? getDataSource(account.providerId) : undefined;
      if (!source?.renameAccount) return;
      await source.renameAccount(account, displayName);
      setMessage(`已将账号改名为「${displayName}」`);
    },
  };
}
