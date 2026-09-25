import { useEffect, useRef } from 'react';
import { focusManager } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useSegments } from 'expo-router';
import { InteractionManager } from 'react-native';
import { useGameResourceSync } from './use-game-resource-sync';
import { queryClient, releaseInactiveQueries } from '@/state/query-client';
import { retryPendingRotationWrites, useSession } from '@/state/session-store';
import { getForegroundAbortSignal, useAppLifecycle } from '@/state/app-lifecycle';
import { runStorageCacheMaintenance } from '@/features/storage-management/storage-cache-maintenance';
import { markRemoteImageCacheGameActive } from '@/services/remote-image-cache';
import { hydrateAccountDisplayData } from '@/services/account-thumbnail';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics';
import { uploadTaskController } from '@/services/upload-maimai-from-friend-code';
import { recordRuntimeRoute } from '@/services/runtime-logs';

export function useAppRuntime(ready: boolean) {
  const routeTemplate = useSegments().join('/');
  useGameResourceSync();
  const restoreStatus = useSession((state) => state.restoreStatus);
  const activeAccountId = useSession((state) => state.activeAccountId);
  const activeGameId = useSession((state) => state.activeGameId);
  const lifecycle = useAppLifecycle();
  const localHydrationGenerationRef = useRef(-1);
  const releasedMemoryWarningRef = useRef(0);
  const storageMaintenanceStartedRef = useRef(false);

  useEffect(() => { recordRuntimeRoute(routeTemplate.split('/')); }, [routeTemplate]);

  useEffect(() => {
    if (restoreStatus !== 'ready') return;
    const task = InteractionManager.runAfterInteractions(() => {
      void markRemoteImageCacheGameActive(activeGameId).catch(() => undefined);
    });
    return () => task.cancel();
  }, [activeAccountId, activeGameId, restoreStatus]);

  useEffect(() => {
    const sessionState = useSession.getState();
    void recordRuntimeDiagnostic('lifecycle', {
      lifecyclePhase: lifecycle.phase,
      gameType: sessionState.activeGameId,
      providerType: sessionState.activeProviderId ?? undefined,
      accountCount: sessionState.boundAccounts.length,
      queryCount: queryClient.getQueryCache().getAll().length,
    });
  }, [lifecycle.foregroundGeneration, lifecycle.phase]);

  useEffect(() => {
    if (lifecycle.memoryWarningGeneration === 0) return;
    void recordRuntimeDiagnostic('memory-warning', {
      lifecyclePhase: lifecycle.phase,
      queryCount: queryClient.getQueryCache().getAll().length,
      memoryWarning: true,
    });
  }, [lifecycle.memoryWarningGeneration, lifecycle.phase]);

  useEffect(() => {
    focusManager.setFocused(lifecycle.foregroundReady);
    if (lifecycle.foregroundReady) {
      uploadTaskController.resume();
      // 前台恢复是补交落盘失败的凭据轮换的安全入口：不重新刷新，只重试本机写入。
      void retryPendingRotationWrites();
    } else if (lifecycle.phase === 'background') uploadTaskController.pause();
    if (lifecycle.phase === 'background') {
      void queryClient.cancelQueries();
    }
    if (lifecycle.memoryWarningGeneration > releasedMemoryWarningRef.current) {
      releasedMemoryWarningRef.current = lifecycle.memoryWarningGeneration;
      releaseInactiveQueries(queryClient);
      void ExpoImage.clearMemoryCache();
    }
  }, [lifecycle.foregroundReady, lifecycle.memoryWarningGeneration, lifecycle.phase]);

  useEffect(() => () => focusManager.setFocused(undefined), []);

  useEffect(() => {
    if (restoreStatus !== 'ready' || !lifecycle.foregroundReady) return;
    if (localHydrationGenerationRef.current === lifecycle.foregroundGeneration) return;
    const signal = getForegroundAbortSignal();
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled || signal.aborted || localHydrationGenerationRef.current === lifecycle.foregroundGeneration) return;
      localHydrationGenerationRef.current = lifecycle.foregroundGeneration;
      void hydrateAccountDisplayData(signal).catch(() => undefined);
    });
    return () => { cancelled = true; task.cancel(); };
  }, [lifecycle.foregroundGeneration, lifecycle.foregroundReady, restoreStatus]);

  useEffect(() => {
    if (!ready || restoreStatus !== 'ready' || !lifecycle.foregroundReady) return;
    if (storageMaintenanceStartedRef.current) return;
    const task = InteractionManager.runAfterInteractions(() => {
      if (storageMaintenanceStartedRef.current) return;
      storageMaintenanceStartedRef.current = true;
      void runStorageCacheMaintenance().catch(() => undefined);
    });
    return () => task.cancel();
  }, [ready, restoreStatus, lifecycle.foregroundReady]);

  return lifecycle;
}
