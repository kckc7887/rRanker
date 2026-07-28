import { originalSongIdForUtage } from './catalog';

export const LXNS_MAIMAI_JACKET_ROOT = 'https://assets2.lxns.net/maimai/jacket';

export function maimaiJacketUrl(songId: string): string {
  const jacketSongId = originalSongIdForUtage(songId) ?? songId;
  return `${LXNS_MAIMAI_JACKET_ROOT}/${encodeURIComponent(jacketSongId)}.png`;
}
