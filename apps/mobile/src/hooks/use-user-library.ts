import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ChartType } from '@/domain/models';
import type { GameId } from '@/domain/game-bind-options';
import {
  chartLibraryKey,
  DEFAULT_TAG_PRESETS,
  songLibraryKey,
  type LibraryTarget,
  type RestoreMode,
  type UserDataBackup,
  type UserLibraryItem,
} from '@/domain/user-library';
import { UserLibraryService } from '@/services/user-library-service';
import { queryClient } from '@/state/query-client';
import { useSession } from '@/state/session-store';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';

export const USER_LIBRARY_QUERY_KEY = ['user-library'] as const;
export const TAG_PRESETS_QUERY_KEY = ['user-library-tag-presets'] as const;
const service = new UserLibraryService(new SqliteUserLibraryRepository());

type Operation =
  | { type: 'favorite'; gameId: GameId; songId: string; value: boolean }
  | { type: 'practice'; gameId: GameId; songId: string; chartType: 'SD' | 'DX'; levelIndex: number; value: boolean }
  | { type: 'tags'; target: LibraryTarget; values: string[] }
  | { type: 'restore'; backup: UserDataBackup; mode: RestoreMode }
  | { type: 'clear' };

function userLibraryQueryKey(gameId: GameId) {
  return [...USER_LIBRARY_QUERY_KEY, gameId] as const;
}

function syncLibraryCache(gameId: GameId, allItems: UserLibraryItem[]) {
  queryClient.setQueryData(userLibraryQueryKey(gameId), allItems.filter((item) => item.gameId === gameId));
}

export function useUserLibrary() {
  const activeGameId = useSession((state) => state.activeGameId);
  const queryKey = userLibraryQueryKey(activeGameId);
  const query = useQuery({
    queryKey,
    queryFn: () => service.list(activeGameId),
    staleTime: Infinity,
  });
  const presets = useQuery({ queryKey: TAG_PRESETS_QUERY_KEY, queryFn: () => service.listTagPresets(), staleTime: Infinity });
  const mutation = useMutation<UserLibraryItem[], Error, Operation>({
    mutationFn: async (operation) => {
      switch (operation.type) {
        case 'favorite': return service.setSongFavorite(operation.gameId, operation.songId, operation.value);
        case 'practice': return service.setChartPractice(operation.gameId, operation.songId, operation.chartType, operation.levelIndex, operation.value);
        case 'tags': return service.setTags(operation.target, operation.values);
        case 'restore': return service.restore(operation.backup, operation.mode);
        case 'clear': await service.clear(); return [];
      }
    },
    onSuccess: (items, operation) => {
      if (operation.type === 'restore' || operation.type === 'clear') {
        void queryClient.invalidateQueries({ queryKey: USER_LIBRARY_QUERY_KEY });
        if (operation.type === 'clear') queryClient.setQueryData(TAG_PRESETS_QUERY_KEY, [...DEFAULT_TAG_PRESETS]);
        return;
      }
      syncLibraryCache(activeGameId, items);
    },
  });
  const presetMutation = useMutation<string[], Error, string[]>({
    mutationFn: (values) => service.setTagPresets(values),
    onSuccess: (values) => queryClient.setQueryData(TAG_PRESETS_QUERY_KEY, values),
  });
  const mutateAsync = mutation.mutateAsync;
  const setSongFavorite = useCallback((songId: string, value: boolean) =>
    mutateAsync({ type: 'favorite', gameId: activeGameId, songId, value }), [activeGameId, mutateAsync]);
  const setChartPractice = useCallback((songId: string, chartType: 'SD' | 'DX', levelIndex: number, value: boolean) =>
    mutateAsync({ type: 'practice', gameId: activeGameId, songId, chartType, levelIndex, value }), [activeGameId, mutateAsync]);
  const setTags = useCallback((target: Omit<LibraryTarget, 'gameId'>, values: string[]) =>
    mutateAsync({ type: 'tags', target: { ...target, gameId: activeGameId }, values }), [activeGameId, mutateAsync]);
  const restoreBackup = useCallback((backup: UserDataBackup, mode: RestoreMode) =>
    mutateAsync({ type: 'restore', backup, mode }), [mutateAsync]);
  const clearUserData = useCallback(() => mutateAsync({ type: 'clear' }), [mutateAsync]);
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
  };
}
