import type { RizlineChart, RizlineDifficulty, RizlineSong } from './rizline';
import { searchDocumentFor, searchDocumentMatches } from '@/utils/search';

export type RizlineFilters = {
  difficulty: RizlineDifficulty | 'all';
  packId: string;
  constantMin: string;
  constantMax: string;
};

export const defaultRizlineFilters = (): RizlineFilters => ({
  difficulty: 'all', packId: 'all', constantMin: '', constantMax: '',
});

export function matchesRizlineChart(chart: RizlineChart, filter: RizlineFilters): boolean {
  if (filter.difficulty !== 'all' && chart.difficulty !== filter.difficulty) return false;
  const lower = filter.constantMin.trim() ? Number(filter.constantMin) : null;
  const upper = filter.constantMax.trim() ? Number(filter.constantMax) : null;
  if ((lower !== null || upper !== null) && chart.constant === null) return false;
  if (lower !== null && Number.isFinite(lower) && chart.constant! < lower) return false;
  if (upper !== null && Number.isFinite(upper) && chart.constant! > upper) return false;
  return true;
}

const songSearchValues = (song: RizlineSong) => [song.id, song.title, song.artist ?? ''];

export function rizlineSongSearchDocument(song: RizlineSong) {
  return searchDocumentFor(song, songSearchValues);
}

export function matchesRizlineSong(song: RizlineSong, filter: RizlineFilters, keyword = '') {
  return (filter.packId === 'all' || song.packId === filter.packId)
    && searchDocumentMatches(rizlineSongSearchDocument(song), keyword)
    && song.charts.some((chart) => matchesRizlineChart(chart, filter));
}

export function filterRizlineSongs(songs: readonly RizlineSong[], filter: RizlineFilters, keyword = '') {
  return songs.filter((song) => matchesRizlineSong(song, filter, keyword));
}

export function rizlinePackOptions(songs: readonly RizlineSong[]) {
  return [{ value: 'all', label: '全部' }, ...Array.from(new Map(songs.map((song) =>
    [song.packId, { value: song.packId, label: song.packName }] as const)).values())];
}
