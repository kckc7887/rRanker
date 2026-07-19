import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DEFAULT_TAG_PRESETS, type LibraryTarget, type RestoreMode, type UserDataBackup, type UserLibraryItem } from '@/domain/user-library';
import { UserLibraryService } from '@/services/user-library-service';
import { queryClient } from '@/state/query-client';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';

export const USER_LIBRARY_QUERY_KEY = ['user-library'] as const;
export const TAG_PRESETS_QUERY_KEY = ['user-library-tag-presets'] as const;
const service = new UserLibraryService(new SqliteUserLibraryRepository());

type Operation =
  | { type: 'favorite'; songId: string; value: boolean }
  | { type: 'practice'; songId: string; chartType: 'SD' | 'DX'; levelIndex: number; value: boolean }
  | { type: 'tags'; target: LibraryTarget; values: string[] }
  | { type: 'restore'; backup: UserDataBackup; mode: RestoreMode }
  | { type: 'clear' };

export function useUserLibrary() {
  const query = useQuery({ queryKey: USER_LIBRARY_QUERY_KEY, queryFn: () => service.list(), staleTime: Infinity });
  const presets = useQuery({ queryKey: TAG_PRESETS_QUERY_KEY, queryFn: () => service.listTagPresets(), staleTime: Infinity });
  const mutation = useMutation<UserLibraryItem[], Error, Operation>({
    mutationFn: async (operation) => {
      switch (operation.type) {
        case 'favorite': return service.setSongFavorite(operation.songId, operation.value);
        case 'practice': return service.setChartPractice(operation.songId, operation.chartType, operation.levelIndex, operation.value);
        case 'tags': return service.setTags(operation.target, operation.values);
        case 'restore': return service.restore(operation.backup, operation.mode);
        case 'clear': await service.clear(); return [];
      }
    },
    onSuccess: (items, operation) => {
      queryClient.setQueryData(USER_LIBRARY_QUERY_KEY, items);
      if (operation.type === 'restore') void queryClient.invalidateQueries({ queryKey: TAG_PRESETS_QUERY_KEY });
      if (operation.type === 'clear') queryClient.setQueryData(TAG_PRESETS_QUERY_KEY, [...DEFAULT_TAG_PRESETS]);
    },
  });
  const presetMutation = useMutation<string[], Error, string[]>({
    mutationFn: (values) => service.setTagPresets(values),
    onSuccess: (values) => queryClient.setQueryData(TAG_PRESETS_QUERY_KEY, values),
  });
  const mutateAsync = mutation.mutateAsync;
  const setSongFavorite = useCallback((songId: string, value: boolean) =>
    mutateAsync({ type: 'favorite', songId, value }), [mutateAsync]);
  const setChartPractice = useCallback((songId: string, chartType: 'SD' | 'DX', levelIndex: number, value: boolean) =>
    mutateAsync({ type: 'practice', songId, chartType, levelIndex, value }), [mutateAsync]);
  const setTags = useCallback((target: LibraryTarget, values: string[]) =>
    mutateAsync({ type: 'tags', target, values }), [mutateAsync]);
  const restoreBackup = useCallback((backup: UserDataBackup, mode: RestoreMode) =>
    mutateAsync({ type: 'restore', backup, mode }), [mutateAsync]);
  const clearUserData = useCallback(() => mutateAsync({ type: 'clear' }), [mutateAsync]);
  const setTagPresets = useCallback((values: string[]) => presetMutation.mutateAsync(values), [presetMutation]);
  return {
    ...query,
    isUpdating: mutation.isPending || presetMutation.isPending,
    updateError: mutation.error,
    setSongFavorite,
    setChartPractice,
    setTags,
    tagPresets: presets.data ?? [...DEFAULT_TAG_PRESETS],
    tagPresetsLoading: presets.isLoading,
    setTagPresets,
    createBackup: () => service.createBackup(),
    restoreBackup,
    clearUserData,
  };
}
