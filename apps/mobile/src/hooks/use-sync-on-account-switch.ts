import { useEffect, useRef } from 'react';
import {
  clearAccountDataQueries,
} from '@/services/invalidate-account-data';
import { consumeAccountSwitchCacheCleared } from '@/services/switch-bound-account';
import { useSession } from '@/state/session-store';

/**
 * 当前绑定账号变化时（换游戏 / 换查分器 / 换同查分器另一号），
 * 清空账号查询缓存并让总览等页进入加载态后重新拉取。
 * 首次 restore 就绪不触发，避免启动双拉。
 * switchBoundAccount 已同步清缓存时跳过，避免打断刚发起的请求。
 */
export function useSyncOnAccountSwitch(): void {
  const activeAccountId = useSession((state) => state.activeAccountId);
  const restoreStatus = useSession((state) => state.restoreStatus);
  const baselineReady = useRef(false);
  const previousAccountId = useRef<string | null>(null);

  useEffect(() => {
    if (restoreStatus !== 'ready') return;

    if (!baselineReady.current) {
      baselineReady.current = true;
      previousAccountId.current = activeAccountId;
      return;
    }

    if (previousAccountId.current === activeAccountId) return;
    previousAccountId.current = activeAccountId;
    if (consumeAccountSwitchCacheCleared()) return;
    clearAccountDataQueries();
  }, [activeAccountId, restoreStatus]);
}
