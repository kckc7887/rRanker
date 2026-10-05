import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChartType } from '@/domain/models';
import type { GameId } from '@/domain/game-bind-options';
import {
  chartLibraryKey,
  DEFAULT_TAG_PRESETS,
  songLibraryKey,
  type LibraryTarget,
  type SongLibraryTarget,
  type ChartLibraryTarget,
  type RestoreMode,
  type UserDataBackup,
  type UserLibraryItem,
} from '@/domain/user-library';
import { UserLibraryService } from '@/services/user-library-service';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { useNotification } from '@/components/AppNotification';
import { getForegroundAbortSignal, useAppLifecycle } from '@/state/app-lifecycle';
import { createRuntimeOperation } from '@/services/runtime-diagnostics-recorder';
import { createInflightGuard } from '@/services/snapshot-cache-utils';

export const USER_LIBRARY_QUERY_KEY = ['user-library'] as const;
export const TAG_PRESETS_QUERY_KEY = ['user-library-tag-presets'] as const;
const service = new UserLibraryService(new SqliteUserLibraryRepository());

type Operation =
  | { type: 'favorite'; gameId: GameId; songId: string; value: boolean }
  | { type: 'practice'; gameId: GameId; songId: string; chartType: ChartType; levelIndex: number; value: boolean }
  | { type: 'tags'; target: LibraryTarget; values: string[] }
  | { type: 'restore'; backup: UserDataBackup; mode: RestoreMode }
  | { type: 'clear' }
  | { type: 'clear-game'; gameId: GameId };

function userLibraryQueryKey(gameId: GameId) {
  return [...USER_LIBRARY_QUERY_KEY, gameId] as const;
}

function syncLibraryCache(gameId: GameId, allItems: UserLibraryItem[]) {
  queryClient.setQueryData(userLibraryQueryKey(gameId), allItems.filter((item) => item.gameId === gameId));
}

type ToggleOperation = Extract<Operation, { type: 'favorite' | 'practice' }>;

function useHandledLibraryActions(
  mutateAsync: (operation: Operation) => Promise<UserLibraryItem[]>,
  gameId: GameId,
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
      trace.record(operation.type, { gameType: operation.gameId, result: 'start' });
      return mutateAsync(operation).then(items => {
        trace.record(operation.type, { gameType: operation.gameId, result: 'success' });
        return items;
      }).catch(() => {
        trace.record(operation.type, { gameType: operation.gameId, result: 'failed' });
        const current = lifetime.current;
        if (current.mounted && current.active && current.epoch === epoch && !signal.aborted
          && useSession.getState().activeGameId === operation.gameId) {
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
  const query = useQuery({
    queryKey,
    queryFn: () => service.list(activeGameId),
    enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [],
    staleTime: Infinity,
  });
  const presets = useQuery({ queryKey: TAG_PRESETS_QUERY_KEY, queryFn: () => service.listTagPresets(), enabled: enabled && tabActive,
    notifyOnChangeProps: tabActive ? undefined : [], staleTime: Infinity });
  const mutation = useMutation<UserLibraryItem[], Error, Operation>({
    mutationFn: async (operation) => {
      switch (operation.type) {
        case 'favorite': return service.setSongFavorite(operation.gameId, operation.songId, operation.value);
        case 'practice': return service.setChartPractice(operation.gameId, operation.songId, operation.chartType, operation.levelIndex, operation.value);
        case 'tags': return service.setTags(operation.target, operation.values);
        case 'restore': return service.restore(operation.backup, operation.mode);
        case 'clear': await service.clear(); return [];
        case 'clear-game': return service.clearGame(operation.gameId);
      }
    },
    onSuccess: (items, operation) => {
      if (operation.type === 'favorite' || operation.type === 'practice' || operation.type === 'tags') {
        syncLibraryCache(operation.type === 'tags' ? operation.target.gameId : operation.gameId, items);
        return;
      }
      if (operation.type === 'restore' || operation.type === 'clear' || operation.type === 'clear-game') {
        void queryClient.invalidateQueries({ queryKey: USER_LIBRARY_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: TAG_PRESETS_QUERY_KEY });
        if (operation.type === 'clear') queryClient.setQueryData(TAG_PRESETS_QUERY_KEY, [...DEFAULT_TAG_PRESETS]);
      }
    },
  });
  const presetMutation = useMutation<string[], Error, string[]>({
    mutationFn: (values) => service.setTagPresets(values),
    onSuccess: (values) => queryClient.setQueryData(TAG_PRESETS_QUERY_KEY, values),
  });
  const mutateAsync = mutation.mutateAsync;
  const toggle = useHandledLibraryActions(mutateAsync, activeGameId, tabActive && lifecycle.foregroundReady,
    lifecycle.foregroundGeneration);
  const setSongFavorite = useCallback((songId: string, value: boolean) =>
    toggle({ type: 'favorite', gameId: activeGameId, songId, value }), [activeGameId, toggle]);
  const setChartPractice = useCallback((songId: string, chartType: ChartType, levelIndex: number, value: boolean) =>
    toggle({ type: 'practice', gameId: activeGameId, songId, chartType, levelIndex, value }), [activeGameId, toggle]);
  const setTags = useCallback((target: Omit<SongLibraryTarget, 'gameId'> | Omit<ChartLibraryTarget, 'gameId'>, values: string[]) =>
    mutateAsync({ type: 'tags', target: { ...target, gameId: activeGameId }, values }), [activeGameId, mutateAsync]);
  const restoreBackup = useCallback((backup: UserDataBackup, mode: RestoreMode) =>
    mutateAsync({ type: 'restore', backup, mode }), [mutateAsync]);
  const clearUserData = useCallback(() => mutateAsync({ type: 'clear' }), [mutateAsync]);
  const clearGameUserData = useCallback((gameId: GameId) => mutateAsync({ type: 'clear-game', gameId }), [mutateAsync]);
  const setTagPresets = useCallback((values: string[]) => presetMutation.mutateAsync(values), [presetMutation]);
  const songKey = useCallback((songId: string | number) => songLibraryKey(activeGameId, songId), [activeGameId]);
  const chartKey = useCallback((songId: string | number, type: ChartType, levelIndex: number) =>
    chartLibraryKey(activeGameId, songId, type, levelIndex), [activeGameId]);
  return {
    ...query,
    activeGameId,
    isUpdating: mutation.isPending || presetMutation.isPending,
    updateError: mutation.error,
    setSongFavorite,
    setChartPractice,
    setTags,
    songKey,
    chartKey,
    tagPresets: presets.data ?? [...DEFAULT_TAG_PRESETS],
    tagPresetsLoading: presets.isLoading,
    setTagPresets,
    createBackup: () => service.createBackup(),
    restoreBackup,
    clearUserData,
    clearGameUserData,
  };
}
