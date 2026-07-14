import { useEffect, useRef } from 'react';
import { invalidateAccountDataQueries } from '@/services/invalidate-account-data';
import { useSession } from '@/state/session-store';

/**
 * 当前绑定账号变化时（换游戏 / 换查分器 / 换同查分器另一号），
 * 自动对该账号同步一次远程数据。首次 restore 就绪不触发，避免启动双拉。
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
    void invalidateAccountDataQueries();
  }, [activeAccountId, restoreStatus]);
}
