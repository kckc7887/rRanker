import type { ChartType, Difficulty, Song } from '@/domain/models';

export interface SongSearchFilters {
  keyword: string;
  types: ChartType[];
  difficulties: Difficulty[];
  constantMin?: number;
  constantMax?: number;
  songVersionIds: number[];
  chartVersionIds: number[];
}

export interface SongSearchEntry { song: Song; text: string }

export const EMPTY_SONG_FILTERS: SongSearchFilters = {
  keyword: '', types: [], difficulties: [], songVersionIds: [], chartVersionIds: [],
};

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

export function buildSongSearchIndex(songs: readonly Song[]): SongSearchEntry[] {
  return songs.map((song) => ({
    song,
    text: normalizeSearchText([
      song.id, song.title, song.artist ?? '', ...(song.aliases ?? []),
      ...song.charts.map((chart) => chart.charter ?? ''),
    ].join('\u0000')),
  }));
}

function includesNumber(values: readonly number[], value?: number): boolean {
  return values.length === 0 || (value !== undefined && values.includes(value));
}

export function searchSongs(index: readonly SongSearchEntry[], filters: SongSearchFilters): Song[] {
  const keyword = normalizeSearchText(filters.keyword);
  const min = filters.constantMin ?? Number.NEGATIVE_INFINITY;
  const max = filters.constantMax ?? Number.POSITIVE_INFINITY;
  return index.filter(({ song, text }) => {
    if (keyword && !text.includes(keyword)) return false;
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
