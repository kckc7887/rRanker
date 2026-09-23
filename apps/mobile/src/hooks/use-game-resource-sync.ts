import { useEffect, useRef } from 'react';
import { useSession } from '@/state/session-store';
import { useAppLifecycle } from '@/state/app-lifecycle';
import type { GameId } from '@/domain/game-bind-options';
import { refreshChunithmCatalog } from '@/hooks/use-chunithm-catalog';
import { refreshMaimaiCatalog } from '@/hooks/use-detailed-catalog';
import { refreshMajdataCatalog } from '@/hooks/use-majdata';
import { refreshMuseDashSessionResources } from '@/hooks/use-muse-dash';
import { refreshRizlineCatalog } from '@/hooks/use-rizline-catalog';
import { refreshPhigrosCatalog } from '@/hooks/use-phigros-catalog';
import { refreshTufDifficulties } from '@/hooks/use-tuf';

const refreshers: Partial<Record<GameId, () => Promise<unknown>>> = {
  maimai: () => refreshMaimaiCatalog(),
  chunithm: () => refreshChunithmCatalog(),
  phigros: refreshPhigrosCatalog,
  rizline: refreshRizlineCatalog,
  musedash: refreshMuseDashSessionResources,
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
