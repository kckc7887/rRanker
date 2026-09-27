import { queryClient } from '@/state/query-client';
import { useEffect, useRef } from 'react';
import { useSession } from '@/state/session-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import type { GameId } from '@/domain/game-bind-options';
import { refreshChunithmCatalog } from '@/services/chunithm-catalog-query';
import { refreshMaimaiCatalog } from '@/services/maimai-catalog-query';
import { refreshMajdataCatalog } from '@/hooks/use-majdata';
import { refreshMuseDashSessionResources } from '@/services/muse-dash-query';
import { refreshRizlineCatalog } from '@/services/rizline-catalog-query';
import { refreshPhigrosCatalog } from '@/services/phigros-catalog-query';
import { refreshTufDifficulties } from '@/hooks/use-tuf';

const refreshers: Partial<Record<GameId, () => Promise<unknown>>> = {
  maimai: () => refreshMaimaiCatalog(queryClient, useSession.getState().catalogProvider),
  chunithm: () => refreshChunithmCatalog(queryClient),
  phigros: () => refreshPhigrosCatalog(queryClient),
  rizline: () => refreshRizlineCatalog(queryClient),
  musedash: () => refreshMuseDashSessionResources(queryClient),
  adofai: refreshTufDifficulties,
  'majdata-net': refreshMajdataCatalog,
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
