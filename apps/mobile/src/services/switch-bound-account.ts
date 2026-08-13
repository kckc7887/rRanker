import { router, type Href } from 'expo-router';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();

const OVERVIEW_HREF = '/(tabs)/(overview)' as Href;

function navigateToOverviewAccountPage(): void {
  if (router.canDismiss()) {
    router.dismissTo(OVERVIEW_HREF);
    return;
  }
  router.navigate(OVERVIEW_HREF);
}

/**
 * 切换到指定已绑定账号：保留按账号隔离的查询缓存并更新会话；
 * 默认进入对应游戏总览账号页（`navigateToOverview: false` 时留在当前页）。
 * 目标账号已有缓存时直接复用；首次访问时由对应 query 自行进入加载态。
 */
export async function switchBoundAccount(
  accountId: string,
  options?: { navigateToOverview?: boolean },
): Promise<void> {
  const { activeAccountId, boundAccounts, selectBoundAccount } = useSession.getState();
  const account = boundAccounts.find((item) => item.id === accountId);
  if (!account) return;

  const navigateToOverview = options?.navigateToOverview !== false;
  let persist: Promise<void> | null = null;
  if (activeAccountId !== accountId) {
    selectBoundAccount(accountId);
    persist = sessions.setActiveAccountId(accountId);
  }

  if (navigateToOverview) {
    navigateToOverviewAccountPage();
  }

  if (persist) await persist;
}
