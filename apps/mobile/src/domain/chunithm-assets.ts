import type { ChunithmSong } from '@/domain/chunithm';

export const CHUNITHM_JACKET_ROOT = 'https://assets2.lxns.net/chunithm/jacket';

export function chunithmJacketUrl(song: ChunithmSong): string {
  const worldsEndOriginId = song.difficulties.find(
    (difficulty) => difficulty.difficulty === 5,
  )?.originId;
  return `${CHUNITHM_JACKET_ROOT}/${worldsEndOriginId ?? song.id}.png`;
}
