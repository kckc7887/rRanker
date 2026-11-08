import { subscribeResourceWrites } from '@rranker/sdk/services/snapshot-cache-utils';
import { useEffect, useRef } from 'react';
import { getGameAdapter, getGameResourceSource, isGameAvailable, usePluginRevision } from '@rranker/sdk/registry';
import { queryClient } from '@rranker/sdk/state/query-client';
import { useSession } from '@rranker/sdk/state/session-store';
import { getForegroundAbortSignal, useAppLifecycle } from '@rranker/sdk/state/app-lifecycle';

export function useGameResourceSync(): void {
  const activeGameId = useSession(state => state.activeGameId);
  const restoreStatus = useSession(state => state.restoreStatus);
  const { foregroundReady } = useAppLifecycle();
  usePluginRevision();
  const adapter = isGameAvailable(activeGameId) ? getGameAdapter(activeGameId) : undefined;
  const refresh = adapter?.refreshResources;
  const adapterId = adapter?.id;
  const sourceId = getGameResourceSource(activeGameId)?.id;
  const entered = useRef<string | null>(null);
  useEffect(() => {
    if (!refresh || !adapterId) { entered.current = null; return; }
    const key = `${activeGameId}:${adapterId}:${sourceId ?? ''}`;
    if (restoreStatus !== 'ready' || !foregroundReady || entered.current === key) return;
    entered.current = key;
    const foreground = getForegroundAbortSignal();
    const controller = new AbortController();
    let settled = false;
    const cancel = () => { controller.abort(foreground.reason ?? new Error('资源请求已失效')); if (!settled && entered.current === key) entered.current = null; };
    foreground.addEventListener('abort', cancel, { once: true });
    const scopes = [activeGameId, adapterId, ...(sourceId ? [sourceId] : [])];
    const subscriptions = scopes.map(scope => subscribeResourceWrites(scope, cancel));
    const release = () => { foreground.removeEventListener('abort', cancel); for (const unsubscribe of subscriptions) unsubscribe(); };
    if (foreground.aborted) cancel();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return refresh({ queryClient, signal: controller.signal });
    }).catch(() => undefined).finally(() => { settled = true; release(); });
    return () => { cancel(); release(); };
  }, [activeGameId, adapterId, sourceId, refresh, restoreStatus, foregroundReady]);
}
