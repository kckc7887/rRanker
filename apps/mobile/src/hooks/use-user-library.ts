import { useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { LibraryTarget, RestoreMode, UserDataBackupV1, UserLibraryItem } from '@/domain/user-library';
import { UserLibraryService } from '@/services/user-library-service';
import { queryClient } from '@/state/query-client';
import { SqliteUserLibraryRepository } from '@/storage/sqlite-user-library-repository';

export const USER_LIBRARY_QUERY_KEY = ['user-library'] as const;
const service = new UserLibraryService(new SqliteUserLibraryRepository());

type Operation =
  | { type: 'favorite'; songId: string; value: boolean }
  | { type: 'practice'; songId: string; chartType: 'SD' | 'DX'; levelIndex: number; value: boolean }
  | { type: 'tags'; target: LibraryTarget; values: string[] }
  | { type: 'restore'; backup: UserDataBackupV1; mode: RestoreMode }
  | { type: 'clear' };

export function useUserLibrary() {
  const query = useQuery({ queryKey: USER_LIBRARY_QUERY_KEY, queryFn: () => service.list(), staleTime: Infinity });
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
    onSuccess: (items) => queryClient.setQueryData(USER_LIBRARY_QUERY_KEY, items),
  });
  const mutateAsync = mutation.mutateAsync;
  const setSongFavorite = useCallback((songId: string, value: boolean) =>
    mutateAsync({ type: 'favorite', songId, value }), [mutateAsync]);
  const setChartPractice = useCallback((songId: string, chartType: 'SD' | 'DX', levelIndex: number, value: boolean) =>
    mutateAsync({ type: 'practice', songId, chartType, levelIndex, value }), [mutateAsync]);
  const setTags = useCallback((target: LibraryTarget, values: string[]) =>
    mutateAsync({ type: 'tags', target, values }), [mutateAsync]);
  const restoreBackup = useCallback((backup: UserDataBackupV1, mode: RestoreMode) =>
    mutateAsync({ type: 'restore', backup, mode }), [mutateAsync]);
  const clearUserData = useCallback(() => mutateAsync({ type: 'clear' }), [mutateAsync]);
  return {
    ...query,
    isUpdating: mutation.isPending,
    updateError: mutation.error,
    setSongFavorite,
    setChartPractice,
    setTags,
    createBackup: () => service.createBackup(),
    restoreBackup,
    clearUserData,
  };
}
