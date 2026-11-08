import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  libraryTargetKey,
  DEFAULT_TAG_PRESETS,
  type LibraryTarget,
  type SongLibraryTarget,
  type ChartLibraryTarget,
  type RestoreMode,
  type UserDataBackup,
  type UserLibraryItem,
} from '@rranker/sdk/domain/user-library';
import { UserLibraryService } from '@rranker/sdk/services/user-library-service';
import { queryClient } from '@rranker/sdk/state/query-client';
import { useSession } from '@rranker/sdk/state/session-store';
import { useCachedTabActive } from '@rranker/sdk/components/CachedTabScreen';
import { useNotification } from '@rranker/sdk/components/AppNotification';
import { getForegroundAbortSignal, useAppLifecycle } from '@rranker/sdk/state/app-lifecycle';
import { createRuntimeOperation } from '@rranker/sdk/services/runtime-diagnostics-recorder';
import { createInflightGuard } from '@rranker/sdk/services/snapshot-cache-utils';
import { getGameAdapter } from '@rranker/sdk/registry';

export const USER_LIBRARY_QUERY_KEY = ['user-library'] as const;
export const TAG_PRESETS_QUERY_KEY = ['user-library-tag-presets'] as const;
const service = new UserLibraryService();

type Operation =
  | { type: 'favorite'; target: SongLibraryTarget; value: boolean }
  | { type: 'practice'; target: ChartLibraryTarget; value: boolean }
  | { type: 'tags'; target: LibraryTarget; values: string[] }
  | { type: 'restore'; gameId: string; backup: UserDataBackup; mode: RestoreMode; signal?: AbortSignal }
  | { type: 'clear-game'; gameId: string };

function userLibraryQueryKey(gameId: string) {
  return [...USER_LIBRARY_QUERY_KEY, gameId] as const;
}

function syncLibraryCache(gameId: string, allItems: UserLibraryItem[]) {
  queryClient.setQueryData(userLibraryQueryKey(gameId), allItems.filter((item) => item.gameId === gameId));
}

type ToggleOperation = Extract<Operation, { type: 'favorite' | 'practice' }>;

function useHandledLibraryActions(
  mutateAsync: (operation: Operation) => Promise<UserLibraryItem[]>,
  gameId: string,
  active: boolean,
  foregroundGeneration: number,
) {
  const { showNotification } = useNotification();
  const lifetime = useRef({ gameId, active, foregroundGeneration, epoch: 0, mounted: true });
  if (lifetime.current.gameId !== gameId || lifetime.current.active !== active
    || lifetime.current.foregroundGeneration !== foregroundGeneration) {
    lifetime.current = { gameId, active, foregroundGeneration, epoch: lifetime.current.epoch + 1,
      mounted: lifetime.current.mounted };
  }
  useEffect(() => {
    lifetime.current.mounted = true;
    return () => { lifetime.current.mounted = false; lifetime.current.epoch += 1; };
  }, []);
  const [pending] = useState(() => createInflightGuard<string>());
  return useCallback((operation: ToggleOperation) => {
    const key = JSON.stringify(operation);
    return pending.dedupe(key, () => {
      const epoch = lifetime.current.epoch;
      const signal = getForegroundAbortSignal();
      const trace = createRuntimeOperation('user-library');
      trace.record(operation.type, { gameType: operation.target.gameId, result: 'start' });
      return mutateAsync(operation).then(items => {
        trace.record(operation.type, { gameType: operation.target.gameId, result: 'success' });
        return items;
      }).catch(() => {
        trace.record(operation.type, { gameType: operation.target.gameId, result: 'failed' });
        const current = lifetime.current;
        if (current.mounted && current.active && current.epoch === epoch && !signal.aborted
          && useSession.getState().activeGameId === operation.target.gameId) {
          showNotification({ title: operation.type === 'favorite' ? '收藏保存失败' : '练习清单保存失败',
            message: '请重试。', variant: 'error' });
        }
        return undefined;
      });
    });
  }, [mutateAsync, pending, showNotification]);
}

export function useUserLibrary(enabled = true) {
  const tabActive = useCachedTabActive();
  const lifecycle = useAppLifecycle();
  const activeGameId = useSession((state) => state.activeGameId);
  const queryKey = userLibraryQueryKey(activeGameId);
  const meta = { gameId: activeGameId, pluginId: getGameAdapter(activeGameId)?.id };
  const query = useQuery({
    queryKey,
    meta,
    queryFn: () => service.list(activeGameId),
    enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [],
    staleTime: Infinity,
  });
  const presetsKey = [...TAG_PRESETS_QUERY_KEY, activeGameId];
  const presets = useQuery({ queryKey: presetsKey, meta, queryFn: () => service.listTagPresets(activeGameId), enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [], staleTime: Infinity });
  const mutation = useMutation<UserLibraryItem[], Error, Operation>({
    mutationFn: async (operation) => {
      switch (operation.type) {
        case 'favorite': return service.setSongFavorite(operation.target, operation.value);
        case 'practice': return service.setChartPractice(operation.target, operation.value);
        case 'tags': return service.setTags(operation.target, operation.values);
        case 'restore': return service.restore(operation.gameId, operation.backup, operation.mode, operation.signal);
        case 'clear-game': return service.clearGame(operation.gameId);
      }
    },
    onSuccess: (items, operation) => {
      if (operation.type === 'favorite' || operation.type === 'practice' || operation.type === 'tags') {
        syncLibraryCache(operation.target.gameId, items);
        return;
      }
      if (operation.type === 'restore' || operation.type === 'clear-game') {
        const gameId = operation.gameId;
        void queryClient.invalidateQueries({ queryKey: userLibraryQueryKey(gameId) });
        void queryClient.invalidateQueries({ queryKey: [...TAG_PRESETS_QUERY_KEY, gameId] });
      }
    },
  });
  const presetMutation = useMutation<string[], Error, { gameId: string; values: string[] }>({
    mutationFn: ({ gameId, values }) => service.setTagPresets(gameId, values),
    onSuccess: (values, { gameId }) => queryClient.setQueryData([...TAG_PRESETS_QUERY_KEY, gameId], values),
  });
  const mutateAsync = mutation.mutateAsync;
  const toggle = useHandledLibraryActions(mutateAsync, activeGameId, tabActive && lifecycle.foregroundReady,
    lifecycle.foregroundGeneration);
  const setSongFavorite = useCallback((target: SongLibraryTarget, value: boolean) =>
    toggle({ type: 'favorite', target, value }), [toggle]);
  const setChartPractice = useCallback((target: ChartLibraryTarget, value: boolean) =>
    toggle({ type: 'practice', target, value }), [toggle]);
  const setTags = useCallback((target: LibraryTarget, values: string[]) =>
    query.data === undefined ? Promise.reject(new Error('标签尚未读取完成'))
      : mutateAsync({ type: 'tags', target, values }), [mutateAsync, query.data]);
  const restoreBackup = useCallback((gameId: string, backup: UserDataBackup, mode: RestoreMode, signal?: AbortSignal) =>
    mutateAsync({ type: 'restore', gameId, backup, mode, signal }), [mutateAsync]);
  const clearGameUserData = useCallback((gameId: string) => mutateAsync({ type: 'clear-game', gameId }), [mutateAsync]);
  const setTagPresets = useCallback((values: string[]) => presets.data === undefined
    ? Promise.reject(new Error('预设尚未读取完成')) : presetMutation.mutateAsync({ gameId: activeGameId, values }), [activeGameId, presetMutation, presets.data]);
  return {
    ...query,
    activeGameId,
    isUpdating: mutation.isPending || presetMutation.isPending,
    updateError: mutation.error,
    setSongFavorite,
    setChartPractice,
    setTags,
    key: libraryTargetKey,
    tagPresets: presets.data ?? [...DEFAULT_TAG_PRESETS],
    tagPresetsLoading: presets.isLoading,
    tagReadState: {
      ready: query.data !== undefined && presets.data !== undefined,
      error: query.isError || presets.isError,
      retry: () => { void query.refetch(); void presets.refetch(); },
    },
    setTagPresets,
    createBackup: (gameId: string) => service.createBackup(gameId),
    restoreBackup,
    clearGameUserData,
  };
}
