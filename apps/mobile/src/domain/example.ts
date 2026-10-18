import type { DxRatingTheme } from './dx-rating-theme';

export const EXAMPLE_COVER_URL = 'https://rranker.cn-nb1.rains3.com/assets/images/ExampleSong.jpg';
export const EXAMPLE_DIFFICULTY_COLORS = ['#00E5A0', '#008CFF'] as const;
export const EXAMPLE_RATING_THEME: DxRatingTheme = {
  id: 'example', label: 'EXAMPLE RATING',
  fillColors: ['#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E'], fillLocations: [0, 0.34, 0.67, 1],
  borderColors: ['#93C5FD', '#C4B5FD', '#F9A8D4', '#FDA4AF'], borderLocations: [0, 0.34, 0.67, 1],
  overlayColor: 'transparent', textColor: '#FFFFFF', starColor: '#FFFFFF', starCount: 0,
};

export type ExampleSong = {
  game: 'example'; id: string; title: string; artist: string;
  genre: string; bpm: number; version: string; coverUrl: string;
};
export type ExampleRecord = { song: ExampleSong; score: number; rating: number };

export const EXAMPLE_SONGS: readonly ExampleSong[] = Array.from({ length: 40 }, (_, index) => ({
  game: 'example', id: String(index + 1).padStart(4, '0'), title: 'EXAMPLE SONG', artist: '颍川ホコリ',
  genre: '流行', bpm: 120, version: 'EXAMPLE', coverUrl: EXAMPLE_COVER_URL,
}));

export const EXAMPLE_STRENGTH_AXES = ['精度', '节奏', '速度', '耐力', '技巧'] as const;
export const EXAMPLE_STRENGTH_SCORES = [9.6, 9.2, 8.8, 8.4, 9.0] as const;
