import { router, type Href } from 'expo-router';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();

const OVERVIEW_HREF = '/(tabs)/(overview)' as Href;
let selectionGeneration = 0;

class AccountSwitchPersistenceError extends Error {
  constructor(readonly accountId: string, readonly generation: number, cause: unknown) {
    super('无法保存当前账号', { cause });
    this.name = 'AccountSwitchPersistenceError';
  }
}

export function notifyAccountSwitchError(
  error: unknown,
  showNotification: (input: { title: string; message: string; variant: 'error' }) => unknown,
): void {
  if (!(error instanceof AccountSwitchPersistenceError)
    || error.generation !== selectionGeneration
    || useSession.getState().activeAccountId !== error.accountId) return;
  showNotification({
    title: '当前账号未保存',
    message: '当前已切换，账号选择未保存，请重新选择',
    variant: 'error',
  });
}

function navigateToOverviewAccountPage(): void {
  if (router.canDismiss()) {
    router.dismissTo(OVERVIEW_HREF);
    return;
  }
  router.navigate(OVERVIEW_HREF);
}

export async function switchBoundAccount(
  accountId: string,
  options?: { navigateToOverview?: boolean },
): Promise<boolean> {
  const { activeAccountId, boundAccounts, selectBoundAccount } = useSession.getState();
  const account = boundAccounts.find((item) => item.id === accountId);
  if (!account) return false;

  const generation = ++selectionGeneration;
  const navigateToOverview = options?.navigateToOverview !== false;
  if (activeAccountId !== accountId) {
    selectBoundAccount(accountId);
  }
  const persist = sessions.setActiveAccountId(accountId);

  if (navigateToOverview) {
    navigateToOverviewAccountPage();
  }

  try { await persist; }
  catch (error) { throw new AccountSwitchPersistenceError(accountId, generation, error); }
  return generation === selectionGeneration && useSession.getState().activeAccountId === accountId;
}
