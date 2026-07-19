import type { ChartType, Difficulty, Song } from '@/domain/models';
import { toRomaji } from 'wanakana';

export interface SongSearchFilters {
  keyword: string;
  types: ChartType[];
  difficulties: Difficulty[];
  constantMin?: number;
  constantMax?: number;
  songVersionIds: number[];
  chartVersionIds: number[];
}

export interface SearchDocument { text: string; compact: string }
export interface SongSearchEntry extends SearchDocument { song: Song }

export const EMPTY_SONG_FILTERS: SongSearchFilters = {
  keyword: '', types: [], difficulties: [], songVersionIds: [], chartVersionIds: [],
};

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

export function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function buildSearchDocument(values: readonly string[]): SearchDocument {
  const normalized = values.flatMap((value) => {
    const source = normalizeSearchText(value);
    const romaji = normalizeSearchText(toRomaji(source));
    return source === romaji ? [source] : [source, romaji];
  });
  return { text: normalized.join('\u0000'), compact: normalized.map(compactSearchText).join('\u0000') };
}

export function searchDocumentMatches(document: SearchDocument, keyword: string): boolean {
  const normalized = normalizeSearchText(keyword);
  if (!normalized) return true;
  return document.text.includes(normalized) || document.compact.includes(compactSearchText(normalized));
}

export function buildSongSearchIndex(songs: readonly Song[]): SongSearchEntry[] {
  return songs.map((song) => {
    const document = buildSearchDocument([
      song.id, song.title, song.artist ?? '', ...(song.aliases ?? []),
      ...song.charts.map((chart) => chart.charter ?? ''),
    ]);
    return { song, ...document };
  });
}

function includesNumber(values: readonly number[], value?: number): boolean {
  return values.length === 0 || (value !== undefined && values.includes(value));
}

export function searchSongs(index: readonly SongSearchEntry[], filters: SongSearchFilters): Song[] {
  const keyword = normalizeSearchText(filters.keyword);
  const min = filters.constantMin ?? Number.NEGATIVE_INFINITY;
  const max = filters.constantMax ?? Number.POSITIVE_INFINITY;
  return index.filter(({ song, ...document }) => {
    if (keyword && !searchDocumentMatches(document, keyword)) return false;
    if (!includesNumber(filters.songVersionIds, song.versionId)) return false;
    const chartMatch = song.charts.some((chart) =>
      (filters.types.length === 0 || filters.types.includes(chart.type)) &&
      (filters.difficulties.length === 0 || filters.difficulties.includes(chart.difficulty)) &&
      chart.difficultyConstant >= min && chart.difficultyConstant <= max &&
      includesNumber(filters.chartVersionIds, chart.versionId));
    return chartMatch;
  }).map(({ song }) => song);
}

export function filterSongs(songs: Song[], keyword: string): Song[] {
  return searchSongs(buildSongSearchIndex(songs), { ...EMPTY_SONG_FILTERS, keyword });
}
