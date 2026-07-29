import { useMemo } from 'react';
import { adaptChunithmSong } from '@/domain/game-model-adapters';
import type { SongDocument } from '@/domain/game-model';
import { useChunithmSongDetail } from './use-chunithm-song-detail';

export function useGameSongDocument(
  songId: string | undefined,
  fallback: SongDocument | undefined,
) {
  const chunithmDetail = useChunithmSongDetail(songId);
  const song = useMemo(
    () => chunithmDetail.data ? adaptChunithmSong(chunithmDetail.data.song) : fallback,
    [chunithmDetail.data, fallback],
  );
  return {
    song,
    isLoading: !fallback && chunithmDetail.isLoading,
    isError: !fallback && chunithmDetail.isError,
    error: chunithmDetail.error,
    refetch: chunithmDetail.refetch,
  };
}
