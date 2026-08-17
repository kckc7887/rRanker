import { z } from 'zod';
import type { OsuGameId } from './game-mode-family';
import type { DataSource } from './models';

/** osu! API 的 ruleset 值：catch 的 API 值是 fruits（官方命名），不是 catch。 */
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

// ---- 上游原始响应 Schema（请求带 x-api-version: 20220705，legacy 字段容错） ----

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

const OsuBeatmapSchema = z.object({
  id: z.number(),
  beatmapset_id: z.number(),
  difficulty_rating: z.number(),
  version: z.string(),
  mode: z.string(),
  status: z.string().optional(),
  total_length: z.number().optional(),
  max_combo: z.number().optional(),
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

/** 个人最佳成绩条目（x-api-version 20220705 新版格式 + legacy score 字段容错）。 */
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
}).passthrough();
export type OsuBestScoreRaw = z.infer<typeof OsuBestScoreSchema>;

const OsuUserStatisticsSchema = z.object({
  pp: z.number().optional(),
  accuracy: z.number().nullable().optional(),
  play_time: z.number().nullable().optional(),
  play_count: z.number().nullable().optional(),
  global_rank: z.number().nullable().optional(),
  country_rank: z.number().nullable().optional(),
}).passthrough();

/** GET /api/v2/me/{mode} 与 /api/v2/users/{user}/{mode} 的响应。 */
export const OsuUserResponseSchema = z.object({
  id: z.number(),
  username: z.string(),
  avatar_url: z.string().nullable().optional(),
  statistics: OsuUserStatisticsSchema,
}).passthrough();
export type OsuUserResponseRaw = z.infer<typeof OsuUserResponseSchema>;

// ---- 规范化快照（游戏自有 DTO，独立于上游字段） ----

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

export type OsuBestScore = {
  id: number;
  /** 展示用得分：新版 total_score，legacy 回退 score/classic_total_score。 */
  score: number;
  accuracy: number;
  maxCombo: number | null;
  pp: number | null;
  rank: string;
  beatmap: OsuBeatmapInfo;
  beatmapset: OsuBeatmapsetInfo;
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

/** 曲库页条目：由 Top 100 的 beatmapset 按 id 去重派生（osu 无上游曲库资源）。 */
export type OsuCatalogSong = {
  beatmapSetId: number;
  title: string;
  artist: string;
  creator: string;
  listCover: string | null;
};

export function osuCatalogSongsFromBest(scores: readonly OsuBestScore[]): OsuCatalogSong[] {
  const seen = new Set<number>();
  const songs: OsuCatalogSong[] = [];
  for (const score of scores) {
    if (seen.has(score.beatmapset.id)) continue;
    seen.add(score.beatmapset.id);
    songs.push({
      beatmapSetId: score.beatmapset.id,
      title: score.beatmapset.title,
      artist: score.beatmapset.artist,
      creator: score.beatmapset.creator,
      listCover: score.beatmapset.listCover,
    });
  }
  return songs;
}

/** 快照 = 数据 + 来源（与 TUF/喵斯快照同构，data 字段承载游戏自有 DTO）。 */
export type OsuSnapshot = {
  data: OsuSnapshotData;
  source: DataSource;
};

export const OSU_SNAPSHOT_SCHEMA_VERSION = 1;

export function osuSnapshotCacheKey(gameId: OsuGameId, userId: number): string {
  return `osu:${gameId}:${userId}`;
}

// ---- 缓存快照校验 Schema ----

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

const OsuBestScoreSnapshotSchema = z.object({
  id: z.number(),
  score: z.number(),
  accuracy: z.number(),
  maxCombo: z.number().nullable(),
  pp: z.number().nullable(),
  rank: z.string(),
  beatmap: OsuBeatmapInfoSnapshotSchema,
  beatmapset: OsuBeatmapsetInfoSnapshotSchema,
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

export const OsuSnapshotSchema = z.object({
  data: z.object({
    player: OsuPlayerSnapshotSchema,
    bestScores: z.array(OsuBestScoreSnapshotSchema),
  }).passthrough(),
  source: OsuDataSourceSchema,
}).passthrough();

// ---- 规范化 ----

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 原始响应 → 游戏自有快照（纯函数，成绩缺 beatmap/beatmapset 的条目不可展示，剔除）。 */
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
    bestScores: scores.flatMap((raw) => {
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
      }];
    }),
  };
}

// ---- 展示口径 ----

/** PP 展示：四舍五入整数 + 千分位（osu! 官方口径）。 */
export function formatOsuPp(pp: number | null | undefined): string {
  if (pp == null || !Number.isFinite(pp)) return '—';
  return Math.round(pp).toLocaleString('en-US');
}

/** 准确率展示：两位小数百分比。 */
export function formatOsuAccuracy(accuracy: number): string {
  return `${(accuracy * 100).toFixed(2)}%`;
}

/** 游戏时间小字：X 天 X 小时 / X 小时。 */
export function formatOsuPlayTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '游戏时间 0 小时';
  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) return `游戏时间 ${days} 天 ${hours} 小时`;
  return `游戏时间 ${hours} 小时`;
}
