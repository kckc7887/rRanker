import { useEffect, useRef } from 'react';
import { useSession } from '@/state/session-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import type { GameId } from '@/domain/game-bind-options';
import { refreshRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { refreshPhigrosCatalog } from '@/hooks/use-phigros-catalog';

const refreshers: Partial<Record<GameId, () => Promise<unknown>>> = {
  phigros: refreshPhigrosCatalog,
  rizline: refreshRizlineCatalog,
};

export function useGameResourceSync(): void {
  const activeGameId = useSession((state) => state.activeGameId);
  const restoreStatus = useSession((state) => state.restoreStatus);
  const { foregroundReady } = useAppLifecycle();
  const entered = useRef<GameId | null>(null);
  useEffect(() => {
    const refresh = refreshers[activeGameId];
    if (!refresh) { entered.current = null; return; }
    if (restoreStatus !== 'ready' || !foregroundReady || entered.current === activeGameId) return;
    entered.current = activeGameId;
    void refresh().catch(() => undefined);
  }, [activeGameId, restoreStatus, foregroundReady]);
}
