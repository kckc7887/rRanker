import { z } from 'zod';
import type { OsuGameId } from './game-mode-family';
import type { DataSource } from './models';

/** catch 在 API 中称为 fruits。 */
export const OSU_RULESET_BY_GAME_ID: Record<OsuGameId, string> = {
  'osu-standard': 'osu',
  'osu-taiko': 'taiko',
  'osu-catch': 'fruits',
  'osu-mania': 'mania',
};

export const OSU_MODE_INT_BY_GAME_ID: Record<OsuGameId, number> = {
  'osu-standard': 0,
  'osu-taiko': 1,
  'osu-catch': 2,
  'osu-mania': 3,
};

const OsuCoversSchema = z.object({
  cover: z.string().optional(),
  'cover@2x': z.string().optional(),
  card: z.string().optional(),
  'card@2x': z.string().optional(),
  list: z.string().optional(),
  'list@2x': z.string().optional(),
  slimcover: z.string().optional(),
  'slimcover@2x': z.string().optional(),
}).passthrough();

/** 上游 cs 在 mania 中表示键数，drain 表示 HP，accuracy 表示 OD。 */
const OsuBeatmapSchema = z.object({
  id: z.number(),
  beatmapset_id: z.number(),
  difficulty_rating: z.number(),
  version: z.string(),
  mode: z.string(),
  status: z.string().optional(),
  total_length: z.number().optional(),
  max_combo: z.number().nullable().optional(),
  bpm: z.number().nullable().optional(),
  cs: z.number().nullable().optional(),
  drain: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  ar: z.number().nullable().optional(),
  count_circles: z.number().nullable().optional(),
  count_sliders: z.number().nullable().optional(),
  count_spinners: z.number().nullable().optional(),
  hit_length: z.number().nullable().optional(),
  mode_int: z.number().nullable().optional(),
  url: z.string().nullable().optional(),
}).passthrough();

const OsuBeatmapsetSchema = z.object({
  id: z.number(),
  title: z.string(),
  title_unicode: z.string().optional(),
  artist: z.string(),
  artist_unicode: z.string().optional(),
  creator: z.string(),
  covers: OsuCoversSchema,
  status: z.string().optional(),
}).passthrough();

const OsuWeightSchema = z.object({
  percentage: z.number(),
  pp: z.number(),
}).passthrough();

const OsuScoreStatisticsSchema = z.object({
  perfect: z.number().nullable().optional(),
  great: z.number().nullable().optional(),
  good: z.number().nullable().optional(),
  ok: z.number().nullable().optional(),
  meh: z.number().nullable().optional(),
  miss: z.number().nullable().optional(),
}).passthrough();

/** 上游同时返回 acronym 字符串数组或 {acronym, settings} 数组。 */
const OsuScoreModsSchema = z.array(z.union([
  z.string(),
  z.object({ acronym: z.string().optional() }).passthrough(),
])).optional().nullable();

export const OsuBestScoreSchema = z.object({
  id: z.number(),
  accuracy: z.number(),
  total_score: z.number().optional(),
  score: z.number().optional(),
  classic_total_score: z.number().optional(),
  max_combo: z.number().optional(),
  pp: z.number().nullable().optional(),
  rank: z.string(),
  beatmap: OsuBeatmapSchema.optional().nullable(),
  beatmapset: OsuBeatmapsetSchema.optional().nullable(),
  weight: OsuWeightSchema.optional().nullable(),
  statistics: OsuScoreStatisticsSchema.nullable().optional(),
  mods: OsuScoreModsSchema,
  ended_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
}).passthrough();
export type OsuBestScoreRaw = z.infer<typeof OsuBestScoreSchema>;

export const OsuBeatmapUserScoreResponseSchema = z.object({
  score: OsuBestScoreSchema,
}).passthrough();
export type OsuBeatmapUserScoreResponseRaw = z.infer<typeof OsuBeatmapUserScoreResponseSchema>;

const OsuUserStatisticsSchema = z.object({
  pp: z.number().optional(),
  accuracy: z.number().nullable().optional(),
  play_time: z.number().nullable().optional(),
  play_count: z.number().nullable().optional(),
  global_rank: z.number().nullable().optional(),
  country_rank: z.number().nullable().optional(),
}).passthrough();

export const OsuUserResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  avatar_url: z.string().nullable().optional(),
  statistics: OsuUserStatisticsSchema,
}).passthrough();
export type OsuUserResponseRaw = z.infer<typeof OsuUserResponseSchema>;

const OsuSearchBeatmapSchema = z.object({
  id: z.number(),
  beatmapset_id: z.number(),
  difficulty_rating: z.number(),
  version: z.string(),
  mode: z.string().optional(),
  mode_int: z.number().optional(),
  status: z.string().optional(),
}).passthrough();

const OsuSearchBeatmapsetSchema = z.object({
  id: z.number(),
  title: z.string(),
  title_unicode: z.string().optional(),
  artist: z.string(),
  artist_unicode: z.string().optional(),
  creator: z.string(),
  covers: OsuCoversSchema,
  beatmaps: z.array(OsuSearchBeatmapSchema).optional(),
}).passthrough();

/** 上游每页最多 50 个谱面集，用 cursor_string 翻页。 */
export const OsuBeatmapsetSearchResponseSchema = z.object({
  beatmapsets: z.array(OsuSearchBeatmapsetSchema),
  total: z.number(),
  cursor_string: z.string().nullable().optional(),
  recommended_difficulty: z.number().nullable().optional(),
}).passthrough();
export type OsuBeatmapsetSearchRaw = z.infer<typeof OsuBeatmapsetSearchResponseSchema>;

const OsuGenreSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
}).passthrough();

const OsuLanguageSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
}).passthrough();

export const OsuBeatmapsetLookupSchema = z.object({
  id: z.number(),
  title: z.string(),
  title_unicode: z.string().optional(),
  artist: z.string(),
  artist_unicode: z.string().optional(),
  creator: z.string(),
  covers: OsuCoversSchema,
  status: z.string().optional(),
  genre: OsuGenreSchema.nullable().optional(),
  language: OsuLanguageSchema.nullable().optional(),
  rating: z.number().nullable().optional(),
  favourite_count: z.number().nullable().optional(),
  play_count: z.number().nullable().optional(),
  tags: z.string().nullable().optional(),
  beatmaps: z.array(OsuBeatmapSchema).optional(),
}).passthrough();
export type OsuBeatmapsetLookupRaw = z.infer<typeof OsuBeatmapsetLookupSchema>;

export type OsuBeatmapInfo = {
  id: number;
  beatmapSetId: number;
  difficultyRating: number;
  version: string;
};

export type OsuBeatmapsetInfo = {
  id: number;
  title: string;
  artist: string;
  creator: string;
  listCover: string | null;
};

export type OsuScoreStatistics = {
  perfect: number | null;
  great: number | null;
  good: number | null;
  ok: number | null;
  meh: number | null;
  miss: number | null;
};

export type OsuBestScore = {
  id: number;
  /** 上游 total_score 优先，其次 score / classic_total_score。 */
  score: number;
  accuracy: number;
  maxCombo: number | null;
  pp: number | null;
  rank: string;
  beatmap: OsuBeatmapInfo;
  beatmapset: OsuBeatmapsetInfo;
  statistics: OsuScoreStatistics | null;
  mods: string[];
  /** 上游 ended_at 优先，其次 created_at。 */
  achievedAt: string | null;
};

export type OsuPlayer = {
  userId: number;
  username: string;
  avatarUrl: string | null;
  pp: number;
  accuracy: number | null;
  playTimeSeconds: number | null;
  playCount: number | null;
  globalRank: number | null;
};

export type OsuSnapshotData = {
  player: OsuPlayer;
  bestScores: OsuBestScore[];
};

export type OsuKnownScoresSnapshot = {
  items: Record<string, OsuBestScore>;
  source: DataSource;
};

export type OsuCatalogSong = {
  beatmapSetId: number;
  title: string;
  artist: string;
  creator: string;
  listCover: string | null;
  difficultyRatings: number[];
};

export type OsuBeatmapDetail = {
  id: number;
  version: string;
  difficultyRating: number;
  mode: string | null;
  totalLength: number | null;
  bpm: number | null;
  cs: number | null;
  drain: number | null;
  accuracy: number | null;
  ar: number | null;
  countCircles: number | null;
  countSliders: number | null;
  countSpinners: number | null;
  maxCombo: number | null;
};

export type OsuBeatmapsetDetail = {
  beatmapSetId: number;
  title: string;
  artist: string;
  creator: string;
  cover: string | null;
  status: string | null;
  genreName: string | null;
  languageName: string | null;
  rating: number | null;
  favouriteCount: number | null;
  tags: string[];
  beatmaps: OsuBeatmapDetail[];
};

export type OsuGeneralFlag =
  | 'recommended' | 'converts' | 'follows' | 'spotlights' | 'featured_artists';

export type OsuSearchStatus =
  | 'any' | 'leaderboard' | 'ranked' | 'qualified' | 'loved'
  | 'favourites' | 'pending' | 'wip' | 'graveyard' | 'mine';

export type OsuExtraFlag = 'video' | 'storyboard';

export const OSU_GENERAL_FILTERS: readonly { flag: OsuGeneralFlag; label: string }[] = [
  { flag: 'recommended', label: '推荐难度' },
  { flag: 'converts', label: '包括转谱' },
  { flag: 'follows', label: '已关注谱师' },
  { flag: 'spotlights', label: '聚光灯谱面' },
  { flag: 'featured_artists', label: '精选艺术家' },
];

export const OSU_STATUS_FILTERS: readonly { value: OsuSearchStatus; label: string }[] = [
  { value: 'any', label: '全部' },
  { value: 'leaderboard', label: '拥有排行榜' },
  { value: 'ranked', label: '上架' },
  { value: 'qualified', label: '过审' },
  { value: 'loved', label: '社区喜爱' },
  { value: 'favourites', label: '收藏' },
  { value: 'pending', label: '待定' },
  { value: 'wip', label: '制作中' },
  { value: 'graveyard', label: '坟场' },
  { value: 'mine', label: '我做的谱面' },
];

export const OSU_GENRE_FILTERS: readonly { value: number; label: string }[] = [
  { value: 0, label: '全部' },
  { value: 1, label: '未指定' },
  { value: 2, label: '电子游戏' },
  { value: 3, label: '动漫' },
  { value: 4, label: '摇滚' },
  { value: 5, label: '流行' },
  { value: 6, label: '其他' },
  { value: 7, label: '新奇' },
  { value: 9, label: '嘻哈' },
  { value: 10, label: '电子' },
  { value: 11, label: '金属' },
  { value: 12, label: '古典' },
  { value: 13, label: '民谣' },
  { value: 14, label: '爵士' },
];

export const OSU_LANGUAGE_FILTERS: readonly { value: number; label: string }[] = [
  { value: 0, label: '全部' },
  { value: 1, label: '英语' },
  { value: 2, label: '汉语' },
  { value: 3, label: '法语' },
  { value: 4, label: '德语' },
  { value: 5, label: '意大利语' },
  { value: 6, label: '日语' },
  { value: 7, label: '韩语' },
  { value: 8, label: '西班牙语' },
  { value: 9, label: '瑞典语' },
  { value: 10, label: '俄语' },
  { value: 11, label: '波兰语' },
  { value: 12, label: '器乐' },
  { value: 13, label: '未指定' },
  { value: 14, label: '其他' },
];

export const OSU_EXTRA_FILTERS: readonly { flag: OsuExtraFlag; label: string }[] = [
  { flag: 'video', label: '有视频' },
  { flag: 'storyboard', label: '有故事板' },
];

export const OSU_NSFW_FILTERS: readonly { value: boolean; label: string }[] = [
  { value: false, label: '隐藏' },
  { value: true, label: '显示' },
];

export type OsuBeatmapsetSearchParams = {
  gameId: OsuGameId;
  q?: string;
  cursor?: string;
  general: readonly OsuGeneralFlag[];
  status: OsuSearchStatus;
  genre: number;
  language: number;
  nsfw: boolean;
  extras: readonly OsuExtraFlag[];
};

export function buildOsuBeatmapsetSearchQuery(
  params: OsuBeatmapsetSearchParams,
): Record<string, string> {
  const query: Record<string, string> = { m: String(OSU_MODE_INT_BY_GAME_ID[params.gameId]) };
  if (params.general.length > 0) query.c = [...new Set(params.general)].join('.');
  if (params.status !== 'any') query.s = params.status;
  if (params.genre !== 0) query.g = String(params.genre);
  if (params.language !== 0) query.l = String(params.language);
  query.nsfw = params.nsfw ? 'true' : 'false';
  if (params.extras.length > 0) query.e = [...new Set(params.extras)].join('.');
  const q = params.q?.trim();
  if (q) query.q = q;
  if (params.cursor) query.cursor_string = params.cursor;
  return query;
}

export function normalizeOsuCatalogSongs(
  raw: OsuBeatmapsetSearchRaw,
  gameId: OsuGameId,
): OsuCatalogSong[] {
  const ruleset = OSU_RULESET_BY_GAME_ID[gameId];
  const modeInt = OSU_MODE_INT_BY_GAME_ID[gameId];
  return raw.beatmapsets.map((set) => {
    const covers = set.covers as Record<string, string | undefined>;
    const ratings = (set.beatmaps ?? [])
      .filter((beatmap) => beatmap.mode === ruleset || beatmap.mode_int === modeInt)
      .map((beatmap) => beatmap.difficulty_rating)
      .sort((a, b) => a - b);
    return {
      beatmapSetId: set.id,
      title: set.title_unicode ?? set.title,
      artist: set.artist_unicode ?? set.artist,
      creator: set.creator,
      listCover: covers['list@2x']
        ?? covers.list
        ?? covers['card@2x']
        ?? covers.card
        ?? null,
      difficultyRatings: ratings,
    };
  });
}

export function normalizeOsuBeatmapsetDetail(
  raw: OsuBeatmapsetLookupRaw,
  gameId: OsuGameId,
): OsuBeatmapsetDetail {
  const ruleset = OSU_RULESET_BY_GAME_ID[gameId];
  const modeInt = OSU_MODE_INT_BY_GAME_ID[gameId];
  const covers = raw.covers as Record<string, string | undefined>;
  const beatmaps = (raw.beatmaps ?? [])
    .filter((beatmap) => beatmap.mode === ruleset || beatmap.mode_int === modeInt)
    .map((beatmap) => ({
      id: beatmap.id,
      version: beatmap.version,
      difficultyRating: beatmap.difficulty_rating,
      mode: beatmap.mode ?? null,
      totalLength: optionalNumber(beatmap.total_length),
      bpm: optionalNumber(beatmap.bpm),
      cs: optionalNumber(beatmap.cs),
      drain: optionalNumber(beatmap.drain),
      accuracy: optionalNumber(beatmap.accuracy),
      ar: optionalNumber(beatmap.ar),
      countCircles: optionalNumber(beatmap.count_circles),
      countSliders: optionalNumber(beatmap.count_sliders),
      countSpinners: optionalNumber(beatmap.count_spinners),
      maxCombo: optionalNumber(beatmap.max_combo),
    }))
    .sort((left, right) => right.difficultyRating - left.difficultyRating);
  return {
    beatmapSetId: raw.id,
    title: raw.title_unicode ?? raw.title,
    artist: raw.artist_unicode ?? raw.artist,
    creator: raw.creator,
    cover: covers['card@2x']
      ?? covers.card
      ?? covers['cover@2x']
      ?? covers.cover
      ?? covers['list@2x']
      ?? covers.list
      ?? null,
    status: raw.status ?? null,
    genreName: raw.genre?.name ?? null,
    languageName: raw.language?.name ?? null,
    rating: optionalNumber(raw.rating),
    favouriteCount: optionalNumber(raw.favourite_count),
    tags: raw.tags == null ? [] : raw.tags.split(/\s+/).filter(Boolean),
    beatmaps,
  };
}

export type OsuSnapshot = {
  data: OsuSnapshotData;
  source: DataSource;
};

export const OSU_SNAPSHOT_SCHEMA_VERSION = 1;
export const OSU_KNOWN_SCORES_SCHEMA_VERSION = 1;

export function osuSnapshotCacheKey(gameId: OsuGameId, userId: number): string {
  return `osu:${gameId}:${userId}`;
}

export function osuKnownScoresCacheKey(gameId: OsuGameId, userId: number): string {
  return `osu-known-scores:${gameId}:${userId}`;
}

const OsuBeatmapInfoSnapshotSchema = z.object({
  id: z.number(),
  beatmapSetId: z.number(),
  difficultyRating: z.number(),
  version: z.string(),
}).passthrough();

const OsuBeatmapsetInfoSnapshotSchema = z.object({
  id: z.number(),
  title: z.string(),
  artist: z.string(),
  creator: z.string(),
  listCover: z.string().nullable(),
}).passthrough();

const OsuScoreStatisticsSnapshotSchema = z.object({
  perfect: z.number().nullable().optional(),
  great: z.number().nullable().optional(),
  good: z.number().nullable().optional(),
  ok: z.number().nullable().optional(),
  meh: z.number().nullable().optional(),
  miss: z.number().nullable().optional(),
}).passthrough();

const OsuBestScoreSnapshotSchema = z.object({
  id: z.number(),
  score: z.number(),
  accuracy: z.number(),
  maxCombo: z.number().nullable(),
  pp: z.number().nullable(),
  rank: z.string(),
  beatmap: OsuBeatmapInfoSnapshotSchema,
  beatmapset: OsuBeatmapsetInfoSnapshotSchema,
  statistics: OsuScoreStatisticsSnapshotSchema.nullable().optional(),
  mods: z.array(z.string()).optional(),
  achievedAt: z.string().nullable().optional(),
}).passthrough();

const OsuPlayerSnapshotSchema = z.object({
  userId: z.number(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  pp: z.number(),
  accuracy: z.number().nullable(),
  playTimeSeconds: z.number().nullable(),
  playCount: z.number().nullable(),
  globalRank: z.number().nullable(),
}).passthrough();

const OsuDataSourceSchema = z.object({
  kind: z.string(),
  label: z.string(),
  updatedAt: z.string(),
  isStale: z.boolean(),
}).passthrough();

export const OsuKnownScoresSnapshotSchema = z.object({
  items: z.record(z.string(), OsuBestScoreSnapshotSchema),
  source: OsuDataSourceSchema,
}).passthrough();

export const OsuSnapshotSchema = z.object({
  data: z.object({
    player: OsuPlayerSnapshotSchema,
    bestScores: z.array(OsuBestScoreSnapshotSchema),
  }).passthrough(),
  source: OsuDataSourceSchema,
}).passthrough();

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeOsuScoreMods(mods: OsuBestScoreRaw['mods']): string[] {
  if (!mods) return [];
  return mods.flatMap((mod) => {
    if (typeof mod === 'string') return mod ? [mod] : [];
    if (typeof mod === 'object' && mod != null && mod.acronym) return [mod.acronym];
    return [];
  });
}

export function normalizeOsuScores(scores: readonly OsuBestScoreRaw[]): OsuBestScore[] {
  return scores.flatMap((raw) => {
      if (!raw.beatmap || !raw.beatmapset) return [];
      const covers = raw.beatmapset.covers as Record<string, string | undefined>;
      return [{
        id: raw.id,
        score: raw.total_score ?? raw.score ?? raw.classic_total_score ?? 0,
        accuracy: raw.accuracy,
        maxCombo: optionalNumber(raw.max_combo),
        pp: optionalNumber(raw.pp),
        rank: raw.rank,
        beatmap: {
          id: raw.beatmap.id,
          beatmapSetId: raw.beatmap.beatmapset_id,
          difficultyRating: raw.beatmap.difficulty_rating,
          version: raw.beatmap.version,
        },
        beatmapset: {
          id: raw.beatmapset.id,
          title: raw.beatmapset.title_unicode ?? raw.beatmapset.title,
          artist: raw.beatmapset.artist_unicode ?? raw.beatmapset.artist,
          creator: raw.beatmapset.creator,
          listCover: covers['list@2x']
            ?? covers.list
            ?? covers['card@2x']
            ?? covers.card
            ?? null,
        },
        statistics: raw.statistics ? {
          perfect: optionalNumber(raw.statistics.perfect),
          great: optionalNumber(raw.statistics.great),
          good: optionalNumber(raw.statistics.good),
          ok: optionalNumber(raw.statistics.ok),
          meh: optionalNumber(raw.statistics.meh),
          miss: optionalNumber(raw.statistics.miss),
        } : null,
        achievedAt: raw.ended_at ?? raw.created_at ?? null,
        mods: normalizeOsuScoreMods(raw.mods),
      }];
    });
}

/** 单谱成绩可能不带谱面元数据，使用当前详情补齐。 */
export function normalizeOsuBeatmapUserScore(
  raw: OsuBestScoreRaw,
  gameId: OsuGameId,
  beatmap: OsuBeatmapInfo,
  beatmapset: OsuBeatmapsetInfo,
): OsuBestScore | null {
  const enriched: OsuBestScoreRaw = {
    ...raw,
    beatmap: raw.beatmap ?? {
      id: beatmap.id,
      beatmapset_id: beatmap.beatmapSetId,
      difficulty_rating: beatmap.difficultyRating,
      version: beatmap.version,
      mode: OSU_RULESET_BY_GAME_ID[gameId],
    },
    beatmapset: raw.beatmapset ?? {
      id: beatmapset.id,
      title: beatmapset.title,
      artist: beatmapset.artist,
      creator: beatmapset.creator,
      covers: beatmapset.listCover ? { list: beatmapset.listCover } : {},
    },
  };
  return normalizeOsuScores([enriched])[0] ?? null;
}

export function normalizeOsuSnapshot(
  user: OsuUserResponseRaw,
  scores: readonly OsuBestScoreRaw[],
): OsuSnapshotData {
  return {
    player: {
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatar_url ?? null,
      pp: optionalNumber(user.statistics.pp) ?? 0,
      accuracy: optionalNumber(user.statistics.accuracy),
      playTimeSeconds: optionalNumber(user.statistics.play_time),
      playCount: optionalNumber(user.statistics.play_count),
      globalRank: optionalNumber(user.statistics.global_rank),
    },
    bestScores: normalizeOsuScores(scores),
  };
}

export const OSU_STATUS_LABELS: Record<string, string> = {
  ranked: '上架',
  approved: '认可',
  qualified: '过审',
  loved: '社区喜爱',
  pending: '待定',
  wip: '制作中',
  graveyard: '坟场',
};

/** taiko 推荐星级为 pp^0.35×0.27，其余模式为 pp^0.4×0.195。 */
export function recommendedOsuStar(gameId: OsuGameId, pp: number | null | undefined): number {
  if (pp == null || !Number.isFinite(pp) || pp <= 0) return 1;
  const base = gameId === 'osu-taiko' ? 0.35 : 0.4;
  const scale = gameId === 'osu-taiko' ? 0.27 : 0.195;
  return Math.pow(pp, base) * scale;
}

/** PP 按整数四舍五入显示。 */
export function formatOsuPp(pp: number | null | undefined): string {
  if (pp == null || !Number.isFinite(pp)) return '—';
  return Math.round(pp).toLocaleString('en-US');
}

export function formatOsuAccuracy(accuracy: number): string {
  return `${(accuracy * 100).toFixed(2)}%`;
}

export function formatOsuPlayTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '游戏时间 0 小时';
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) return `游戏时间 ${days} 天 ${hours} 小时`;
  return `游戏时间 ${hours} 小时`;
}
