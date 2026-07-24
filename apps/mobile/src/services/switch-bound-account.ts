import { router, type Href } from 'expo-router';
import { clearAccountDataQueries } from '@/services/invalidate-account-data';
import { useSession } from '@/state/session-store';
import { SecureSessionStore } from '@/storage/secure-session-store';

const sessions = new SecureSessionStore();

/** 由 switchBoundAccount 置位，供 useSyncOnAccountSwitch 跳过重复清缓存。 */
let accountSwitchClearedCache = false;

export function consumeAccountSwitchCacheCleared(): boolean {
  if (!accountSwitchClearedCache) return false;
  accountSwitchClearedCache = false;
  return true;
}

const OVERVIEW_HREF = '/(tabs)/(overview)' as Href;

function navigateToOverviewAccountPage(): void {
  if (router.canDismiss()) {
    router.dismissTo(OVERVIEW_HREF);
    return;
  }
  router.navigate(OVERVIEW_HREF);
}

/**
 * 切换到指定已绑定账号：先清账号查询缓存，再更新会话；
 * 默认进入对应游戏总览账号页（`navigateToOverview: false` 时留在当前页）。
 * 总览等页在数据就绪前保持加载态，避免缓存命中时边渲染边重拉导致卡顿。
 */
export function switchBoundAccount(
  accountId: string,
  options?: { navigateToOverview?: boolean },
): void {
  const { activeAccountId, boundAccounts, selectBoundAccount } = useSession.getState();
  const account = boundAccounts.find((item) => item.id === accountId);
  if (!account) return;

  const navigateToOverview = options?.navigateToOverview !== false;
  if (activeAccountId !== accountId) {
    clearAccountDataQueries();
    accountSwitchClearedCache = true;
    selectBoundAccount(accountId);
    void sessions.setActiveAccountId(accountId);
  }

  if (navigateToOverview) {
    navigateToOverviewAccountPage();
  }
}
