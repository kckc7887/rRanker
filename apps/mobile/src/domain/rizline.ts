/**
 * AH compatibility/best-group portions adapted from REDDRAGON-HL/rizline_b40_tool
 * (Apache-2.0), 93b2881d5cea7d53ac11706c028245ed144d8a16.
 * Modified by rRanker, 2026-09-14: typed inputs, inferred/unknown states, SP exclusion,
 * stable ordering and partial groups. See THIRD_PARTY_NOTICES.md and
 * LICENSES/rizline_b40_tool-APACHE-2.0.txt for the attribution and full license.
 */
import type { DataSource } from './models';
import type { DxRatingTheme } from './dx-rating-theme';

export const RIZLINE_RESOURCE_BASE = 'https://rranker-rizline-data.cn-nb1.rains3.com';
export const RIZLINE_RATING_THEME: DxRatingTheme = {
  id: 'rizline', label: 'Rizline', fillColors: ['#B5D9D0', '#94C5B8', '#7AB1A3'], fillLocations: [0, 0.52, 1],
  borderColors: ['#52796F', '#3B6157'], borderLocations: [0, 1], overlayColor: 'rgba(75,78,85,0.10)',
  textColor: '#263C36', starColor: '#3B6157', starCount: 0,
};
export const RIZLINE_DIFFICULTIES = ['EZ', 'HD', 'IN', 'AT', 'SP'] as const;
export type RizlineDifficulty = typeof RIZLINE_DIFFICULTIES[number];
export type RizlineChart = {
  id: string; songId: string; difficulty: RizlineDifficulty; level: string;
  constant: number | null; designer: string | null; hit: number | null;
  combo: number | null; maxScore: number | null; riztimeHit: number | null;
  chartPath: string;
};
export type RizlineSong = {
  id: string; title: string; artist: string | null; illustrator: string | null;
  packId: string; packName: string; bpm: string | null; durationSeconds: number | null;
  updatedAt: string | null; coverPath: string | null; audioPath: string; charts: RizlineChart[];
  achievements: { id: string; title: string; condition: string }[];
};
export type RizlineCatalog = {
  schemaVersion: 1; resourceVersion: string; gameVersion: string; songs: RizlineSong[];
};
export type RizlinePlayer = { userId: string; username: string; totalRks: number };
export type RizlineSave = RizlinePlayer & {
  myBest: { trackAssetId: string; difficultyClassName: RizlineDifficulty; score: number;
    completeRate: number; isFullCombo?: boolean; isClear?: boolean }[];
  levelsRks: { trackId: string; difficultyClassName: RizlineDifficulty; rks: number }[];
};
export type RizlineRecord = {
  chartId: string; songId: string; difficulty: RizlineDifficulty; levelIndex: number;
  title: string; achievements: number | null; score: number | null; rks: number | null;
  ap: boolean; ahStatus: 'inferred' | 'unknown' | 'incompatible'; chart?: RizlineChart;
};
export type RizlineBest = {
  ah5: RizlineRecord[]; b35: RizlineRecord[]; ah5Contribution: number | null; b35Contribution: number | null; hasUnknownCandidates: boolean;
};
export type RizlineSnapshot = { save: RizlineSave; source: DataSource; requiresLogin?: boolean };
export type RizlineCatalogData = { snapshot: RizlineCatalog; source: DataSource };

const DIFFICULTY_COLORS: Record<RizlineDifficulty, string> = {
  EZ: '#25826E', HD: '#A36721', IN: '#BB563B', AT: '#4B364C', SP: '#68717C',
};
export function rizlineDifficultyColors(difficulty: RizlineDifficulty, _dark = false) {
  return { bg: DIFFICULTY_COLORS[difficulty], fg: '#FFFFFF' };
}
function isRizlineAp(achievements: number | null | undefined): boolean {
  // A full-completion float can be 120.00000762939453 after the game's percentage calculation.
  return achievements != null && Number.isFinite(achievements) && achievements >= 120;
}
export function rizlineRecordStatus(record?: Pick<RizlineRecord, 'achievements' | 'ahStatus'>): 'ap' | 'ah' | 'normal' {
  if (isRizlineAp(record?.achievements)) return 'ap';
  return record?.ahStatus === 'inferred' ? 'ah' : 'normal';
}
export function rizlineDifficultyIndex(difficulty: RizlineDifficulty): number {
  return RIZLINE_DIFFICULTIES.indexOf(difficulty);
}
export function sortedRizlineCharts(charts: readonly RizlineChart[]): RizlineChart[] {
  return [...charts].sort((a, b) => rizlineDifficultyIndex(b.difficulty) - rizlineDifficultyIndex(a.difficulty));
}
export function formatRizlineRks(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(4);
}
export function formatRizlineAccuracy(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(4)}%`;
}
export function rizlineCoverUrl(song: RizlineSong, _catalog?: RizlineCatalog): string | null {
  return song.coverPath ? `${RIZLINE_RESOURCE_BASE}/${song.coverPath.split('/').map(encodeURIComponent).join('/')}` : null;
}
export function rizlineTrackId(id: string): string {
  return id.startsWith('track.') ? id.slice(6) : id;
}
export function rizlineRecordKey(songId: string, difficulty: RizlineDifficulty): string {
  return `${rizlineTrackId(songId)}|${difficulty}`;
}

const ACC_RKS = [[120, 10.5], [118, 10.2], [116, 9.9], [114, 9.6], [112, 9.3],
  [110, 9], [105, 8.25], [100, 7.5], [95, 6.75], [90, 6], [80, 4.5], [70, 3], [60, 1.5], [0, 0]] as const;
export function rizlineAccuracyRks(accuracy: number): number {
  return ACC_RKS.find(([threshold]) => accuracy >= threshold)?.[1] ?? 0;
}
export function rizlineRiztimeThreshold(hit: number, difficulty: RizlineDifficulty): number {
  const k = difficulty === 'EZ' ? 0.5 : difficulty === 'HD' ? 0.9 : 0.98;
  return (1 - k) * hit > 5 ? Math.ceil(k * hit - 1e-12) : hit - 5;
}

// https://github.com/REDDRAGON-HL/rizline_b40_tool/blob/93b2881d5cea7d53ac11706c028245ed144d8a16/rizb40_tool.js
// Stored score/accuracy and RKS can represent different plays. Compatibility never proves All Hit.
export function inferRizlineAh(record: Pick<RizlineRecord, 'difficulty' | 'rks' | 'score' | 'achievements' | 'chart'>): RizlineRecord['ahStatus'] {
  if (record.difficulty === 'SP') return 'incompatible';
  const chart = record.chart;
  if (!chart || record.rks == null || record.achievements == null || record.score == null
    || chart.constant == null || chart.constant <= 0 || chart.riztimeHit == null || chart.hit == null
    || chart.hit <= 0 || chart.riztimeHit > chart.hit) return 'unknown';
  const h = rizlineRiztimeThreshold(chart.riztimeHit, record.difficulty);
  if (h <= 0) return 'unknown';
  const c = chart.constant;
  const acc = rizlineAccuracyRks(record.achievements);
  const x = h * (11 * c + acc - record.rks) / c;
  const integral = Math.abs(x - Math.round(x)) <= 1e-6 && x >= -1e-6 && x <= h + 1e-6;
  const perfect = (record.score - 1_000_000) / 100;
  const validPerfect = Number.isInteger(perfect) && perfect >= 0 && perfect <= chart.riztimeHit;
  const expected = 10 * c + acc + c * Math.min(perfect, h) / h;
  return integral || (validPerfect && Math.fround(expected) === Math.fround(record.rks)) ? 'inferred' : 'incompatible';
}

export function sortRizlineRecords(records: readonly RizlineRecord[]): RizlineRecord[] {
  return [...records].sort((a, b) => {
    if (a.rks == null && b.rks != null) return 1;
    if (a.rks != null && b.rks == null) return -1;
    return (b.rks ?? 0) - (a.rks ?? 0) || (a.chartId < b.chartId ? -1 : a.chartId > b.chartId ? 1 : 0);
  });
}
export function buildRizlineRecords(save: RizlineSave, catalog?: RizlineCatalog): RizlineRecord[] {
  const songs = new Map(catalog?.songs.map(song => [song.id, song]));
  const charts = new Map(catalog?.songs.flatMap(song => song.charts.map(chart => [rizlineRecordKey(song.id, chart.difficulty), chart] as const)));
  const rows = new Map<string, RizlineRecord>();
  const ensure = (rawId: string, difficulty: RizlineDifficulty) => {
    const songId = rizlineTrackId(rawId);
    const key = rizlineRecordKey(songId, difficulty);
    let row = rows.get(key);
    if (!row) {
      const chart = charts.get(key);
      row = { chartId: chart?.id ?? `${songId}|${difficulty}`, songId, difficulty,
        levelIndex: rizlineDifficultyIndex(difficulty), title: songs.get(songId)?.title ?? songId,
        achievements: null, score: null, rks: null, ap: false, ahStatus: 'unknown', chart };
      rows.set(key, row);
    }
    return row;
  };
  for (const best of save.myBest) {
    const row = ensure(best.trackAssetId, best.difficultyClassName);
    row.achievements = Math.max(row.achievements ?? 0, best.completeRate);
    row.score = Math.max(row.score ?? 0, best.score);
    row.ap = isRizlineAp(row.achievements);
  }
  for (const level of save.levelsRks) {
    const row = ensure(level.trackId, level.difficultyClassName);
    if (row.difficulty !== 'SP') row.rks = Math.max(row.rks ?? 0, level.rks);
  }
  for (const row of rows.values()) row.ahStatus = inferRizlineAh(row);
  return sortRizlineRecords([...rows.values()]);
}
export function selectRizlineBest(records: readonly RizlineRecord[]): RizlineBest {
  const ordered = sortRizlineRecords(records).filter(record => record.difficulty !== 'SP' && record.rks != null);
  const unique = ordered.filter((record, index) => ordered.findIndex(other => other.chartId === record.chartId) === index);
  const ah5 = unique.filter(record => record.ahStatus === 'inferred').slice(0, 5);
  const selected = new Set(ah5.map(record => record.chartId));
  const b35 = unique.filter(record => !selected.has(record.chartId)).slice(0, 35);
  const contribution = (group: RizlineRecord[]) => group.reduce((total, record) => total + (record.rks ?? 0), 0) / 40;
  const relevantCandidates = ah5.length < 5 ? unique : unique.slice(0, unique.indexOf(ah5[4]));
  const hasUnknownCandidates = relevantCandidates.some(record => record.ahStatus === 'unknown');
  return { ah5, b35, hasUnknownCandidates,
    ah5Contribution: hasUnknownCandidates ? null : contribution(ah5),
    b35Contribution: hasUnknownCandidates ? null : contribution(b35) };
}
