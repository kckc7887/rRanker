import { difficultyFromIndex, normalizeSongId } from '@/domain/catalog';
import { calculateChartRating } from '@/domain/rating';
import type { CatalogSnapshot, ChartType, ScoreRecord, Song } from '@/domain/models';
import type { ScoreHubSyncScore } from '@/services/score-hub-client';

export type DivingFishUploadRecord = {
  achievements: number;
  dxScore: number | null;
  fc: string | null;
  fs: string | null;
  level_index: number;
  title: string;
  type: 'SD' | 'DX';
};

export type SyncMapResult = {
  records: DivingFishUploadRecord[];
  skippedNoTitle: number;
  skippedBadScore: number;
  skippedUnsupportedChart: number;
};

export type LxnsUploadScore = {
  id: number;
  level_index: number;
  achievements: number;
  fc: string | null;
  fs: string | null;
  dx_score: number | null;
  dx_star: number;
  type: 'standard' | 'dx' | 'utage';
};

export type GenericSyncMapResult<T> = {
  records: T[];
  skippedNoSong: number;
  skippedBadScore: number;
  skippedUnsupportedChart: number;
};

/** 解析 hub 的 `"100.2618%"` / 数值为达成率。 */
export function parseHubAchievement(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
  const parsed = Number(withoutPercent);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapHubTypeToDivingFish(type: string): 'SD' | 'DX' {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'sd') return 'SD';
  return 'DX';
}

function toNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDxScore(value: string | number | null | undefined): number | null {
  const parsed = toNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function mapHubFcToCanonical(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && ['fc', 'fcp', 'ap', 'app'].includes(normalized) ? normalized : null;
}

export function mapHubFsToCanonical(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'fdxp') return 'fsdp';
  if (normalized === 'fdx') return 'fsd';
  return ['sync', 'fs', 'fsp', 'fsd', 'fsdp'].includes(normalized) ? normalized : null;
}

export function scoreRateFromAchievement(achievement: number): string {
  if (achievement >= 100.5) return 'sssp';
  if (achievement >= 100) return 'sss';
  if (achievement >= 99.5) return 'ssp';
  if (achievement >= 99) return 'ss';
  if (achievement >= 98) return 'sp';
  if (achievement >= 97) return 's';
  if (achievement >= 94) return 'aaa';
  if (achievement >= 90) return 'aa';
  if (achievement >= 80) return 'a';
  if (achievement >= 75) return 'bbb';
  if (achievement >= 70) return 'bb';
  if (achievement >= 60) return 'b';
  if (achievement >= 50) return 'c';
  return 'd';
}

function songsByNormalizedId(catalog: CatalogSnapshot): Map<string, Song> {
  return new Map(catalog.songs.map((song) => [normalizeSongId(song.id), song]));
}

function normalizedHubType(type: string): 'standard' | 'dx' | 'utage' | null {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'standard' || normalized === 'sd') return 'standard';
  if (normalized === 'dx') return 'dx';
  if (normalized === 'utage') return 'utage';
  return null;
}

function chartTypeForHub(type: 'standard' | 'dx' | 'utage'): ChartType {
  return type === 'standard' ? 'SD' : 'DX';
}

export function convertHubScoresToLocalRecords(
  scores: readonly ScoreHubSyncScore[],
  catalog: CatalogSnapshot,
): GenericSyncMapResult<ScoreRecord> {
  const records: ScoreRecord[] = [];
  const songs = songsByNormalizedId(catalog);
  let skippedNoSong = 0;
  let skippedBadScore = 0;
  let skippedUnsupportedChart = 0;

  for (const score of scores) {
    const hubType = normalizedHubType(score.type);
    if (!hubType || hubType === 'utage' || !Number.isInteger(score.chartIndex)
      || score.chartIndex < 0 || score.chartIndex > 4) {
      skippedUnsupportedChart += 1;
      continue;
    }
    const song = songs.get(normalizeSongId(score.musicId));
    if (!song) {
      skippedNoSong += 1;
      continue;
    }
    const type = chartTypeForHub(hubType);
    const chart = song.charts.find(
      (item) => item.type === type && item.levelIndex === score.chartIndex,
    );
    if (!chart) {
      skippedUnsupportedChart += 1;
      continue;
    }
    const achievements = parseHubAchievement(score.score);
    if (achievements === null || achievements < 0 || achievements > 101) {
      skippedBadScore += 1;
      continue;
    }
    records.push({
      ...chart,
      songId: song.id,
      title: song.title,
      difficulty: chart.difficulty ?? difficultyFromIndex(chart.levelIndex),
      achievements,
      dxScore: toDxScore(score.dxScore),
      rating: calculateChartRating(chart.difficultyConstant, achievements),
      fc: mapHubFcToCanonical(score.fc),
      fs: mapHubFsToCanonical(score.fs),
      rate: scoreRateFromAchievement(achievements),
      version: song.version,
    });
  }
  return { records, skippedNoSong, skippedBadScore, skippedUnsupportedChart };
}

export function convertHubScoresToLxnsRecords(
  scores: readonly ScoreHubSyncScore[],
  catalog: CatalogSnapshot,
): GenericSyncMapResult<LxnsUploadScore> {
  const records: LxnsUploadScore[] = [];
  const songs = songsByNormalizedId(catalog);
  let skippedNoSong = 0;
  let skippedBadScore = 0;
  let skippedUnsupportedChart = 0;

  for (const score of scores) {
    const type = normalizedHubType(score.type);
    const levelIndex = type === 'utage' ? 0 : score.chartIndex;
    if (!type || !Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex > 4) {
      skippedUnsupportedChart += 1;
      continue;
    }
    const normalizedId = normalizeSongId(score.musicId);
    const song = songs.get(normalizedId);
    const id = Number(normalizedId);
    if (!song || !Number.isSafeInteger(id) || id < 0) {
      skippedNoSong += 1;
      continue;
    }
    if (type !== 'utage') {
      const chartType = chartTypeForHub(type);
      if (!song.charts.some((chart) => chart.type === chartType && chart.levelIndex === levelIndex)) {
        skippedUnsupportedChart += 1;
        continue;
      }
    }
    const achievements = parseHubAchievement(score.score);
    if (achievements === null || achievements < 0 || achievements > 101) {
      skippedBadScore += 1;
      continue;
    }
    records.push({
      id,
      level_index: levelIndex,
      achievements,
      fc: mapHubFcToCanonical(score.fc),
      fs: mapHubFsToCanonical(score.fs),
      dx_score: toDxScore(score.dxScore),
      dx_star: 0,
      type,
    });
  }
  return { records, skippedNoSong, skippedBadScore, skippedUnsupportedChart };
}

/** 用曲库构建 musicId → title；兼容 DX 偏移 id。 */
export function buildMusicTitleMap(catalog: CatalogSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const song of catalog.songs) {
    map.set(song.id, song.title);
    map.set(normalizeSongId(song.id), song.title);
    const numeric = Number(song.id);
    if (Number.isSafeInteger(numeric) && numeric > 0 && numeric < 10000) {
      map.set(String(numeric + 10000), song.title);
    }
  }
  return map;
}

function lookupTitle(musicId: string, titleMap: Map<string, string>): string | null {
  return titleMap.get(musicId)
    ?? titleMap.get(normalizeSongId(musicId))
    ?? null;
}

export function convertHubScoresToDivingFishRecords(
  scores: readonly ScoreHubSyncScore[],
  titleMap: Map<string, string>,
): SyncMapResult {
  const records: DivingFishUploadRecord[] = [];
  let skippedNoTitle = 0;
  let skippedBadScore = 0;
  let skippedUnsupportedChart = 0;

  for (const score of scores) {
    const normalizedType = score.type.trim().toLowerCase();
    if (!Number.isInteger(score.chartIndex) || score.chartIndex < 0 || score.chartIndex > 4
      || (normalizedType !== 'standard' && normalizedType !== 'sd' && normalizedType !== 'dx')) {
      skippedUnsupportedChart += 1;
      continue;
    }
    const title = lookupTitle(String(score.musicId), titleMap);
    if (!title) {
      skippedNoTitle += 1;
      continue;
    }
    const achievements = parseHubAchievement(score.score);
    if (achievements === null || achievements < 0 || achievements > 101) {
      skippedBadScore += 1;
      continue;
    }
    records.push({
      achievements,
      dxScore: toDxScore(score.dxScore),
      fc: mapHubFcToCanonical(score.fc),
      fs: mapHubFsToCanonical(score.fs),
      level_index: score.chartIndex,
      title,
      type: mapHubTypeToDivingFish(score.type),
    });
  }

  return { records, skippedNoTitle, skippedBadScore, skippedUnsupportedChart };
}
