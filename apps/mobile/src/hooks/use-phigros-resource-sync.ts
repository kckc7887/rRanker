import { useEffect, useRef } from 'react';
import { useSession } from '@/state/session-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import { refreshPhigrosCatalog } from '@/hooks/use-phigros-catalog';

export function usePhigrosResourceSync(): void {
  const activeGameId = useSession((state) => state.activeGameId);
  const restoreStatus = useSession((state) => state.restoreStatus);
  const { foregroundReady } = useAppLifecycle();
  const entered = useRef(false);
  useEffect(() => {
    if (activeGameId !== 'phigros') { entered.current = false; return; }
    if (restoreStatus !== 'ready' || !foregroundReady || entered.current) return;
    entered.current = true;
    void refreshPhigrosCatalog().catch(() => undefined);
  }, [activeGameId, restoreStatus, foregroundReady]);
}
