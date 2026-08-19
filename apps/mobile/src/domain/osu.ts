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

/**
 * 单张谱面原始结构（BeatmapExtended 属性）：详情页需要 bpm/cs（mania 即键数）/
 * drain（HP）/accuracy（OD）/ar/物件计数/时长等属性；上游可能对部分字段返回
 * null（未统计），统一 nullable 容错，缺失时规范化为 null。
 */
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

/** 成绩判定计数（20220705 版 statistics）：各键可能缺失或为 null，逐字段容错。 */
const OsuScoreStatisticsSchema = z.object({
  perfect: z.number().nullable().optional(),
  great: z.number().nullable().optional(),
  good: z.number().nullable().optional(),
  ok: z.number().nullable().optional(),
  meh: z.number().nullable().optional(),
  miss: z.number().nullable().optional(),
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
  statistics: OsuScoreStatisticsSchema.nullable().optional(),
  ended_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
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

/** GET /api/v2/beatmapsets/search 响应条目：beatmap（含 mode/mode_int 供按模式过滤）。 */
const OsuSearchBeatmapSchema = z.object({
  id: z.number(),
  beatmapset_id: z.number(),
  difficulty_rating: z.number(),
  version: z.string(),
  mode: z.string().optional(),
  mode_int: z.number().optional(),
  status: z.string().optional(),
}).passthrough();

/** GET /api/v2/beatmapsets/search 响应条目：beatmapset（曲库页的「歌曲」）。 */
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

/** GET /api/v2/beatmapsets/search 响应：每页 50 份（上游 osu.beatmaps.max 固定），cursor_string 翻页。 */
export const OsuBeatmapsetSearchResponseSchema = z.object({
  beatmapsets: z.array(OsuSearchBeatmapsetSchema),
  total: z.number(),
  cursor_string: z.string().nullable().optional(),
  recommended_difficulty: z.number().nullable().optional(),
}).passthrough();
export type OsuBeatmapsetSearchRaw = z.infer<typeof OsuBeatmapsetSearchResponseSchema>;

/** beatmapset 的流派（BeatmapsetExtended.genre，仅取 name 展示）。 */
const OsuGenreSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
}).passthrough();

/** beatmapset 的语言（BeatmapsetExtended.language，仅取 name 展示）。 */
const OsuLanguageSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
}).passthrough();

/** GET /api/v2/beatmapsets/{id} 响应（BeatmapsetExtended，歌曲详情页数据源）。 */
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
  beatmaps: z.array(OsuBeatmapSchema).optional(),
}).passthrough();
export type OsuBeatmapsetLookupRaw = z.infer<typeof OsuBeatmapsetLookupSchema>;

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

/** 判定计数展示口径：旧缓存/旧版成绩无 statistics 时整体为 null。 */
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
  /** 展示用得分：新版 total_score，legacy 回退 score/classic_total_score。 */
  score: number;
  accuracy: number;
  maxCombo: number | null;
  pp: number | null;
  rank: string;
  beatmap: OsuBeatmapInfo;
  beatmapset: OsuBeatmapsetInfo;
  /** 判定计数（perfect/great/good/ok/meh/miss）；旧版成绩或旧缓存无该数据时为 null。 */
  statistics: OsuScoreStatistics | null;
  /** 达成时间（ISO 字符串）：新版 ended_at，legacy 回退 created_at；缺失为 null。 */
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

/** 曲库页条目：一首歌 = 一个 beatmapset；难度标签为该 set 下当前模式全部 beatmaps 星数升序。 */
export type OsuCatalogSong = {
  beatmapSetId: number;
  title: string;
  artist: string;
  creator: string;
  listCover: string | null;
  difficultyRatings: number[];
};

/** 歌曲详情页单张谱面（BeatmapExtended 规范化）：数值属性缺失为 null，展示层负责 '—'。 */
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

/** 歌曲详情页歌曲（GET /beatmapsets/{id} 规范化）：beatmaps 已按当前模式过滤并按星数降序。 */
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
  beatmaps: OsuBeatmapDetail[];
};

// ---- 曲库搜索（beatmapset search）筛选口径 ----

/** 常规组筛选（请求参数 c，点号连接）：与 osu 官网侧栏一致。 */
export type OsuGeneralFlag =
  | 'recommended' | 'converts' | 'follows' | 'spotlights' | 'featured_artists';

/** 分类筛选（请求参数 s）：与 osu 官网一致。 */
export type OsuSearchStatus =
  | 'any' | 'leaderboard' | 'ranked' | 'qualified' | 'loved'
  | 'favourites' | 'pending' | 'wip' | 'graveyard' | 'mine';

/** 其他筛选（请求参数 e，点号连接）。 */
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

/** 不良内容：隐藏（默认，nsfw=false）/ 显示（nsfw=true）。 */
export const OSU_NSFW_FILTERS: readonly { value: boolean; label: string }[] = [
  { value: false, label: '隐藏' },
  { value: true, label: '显示' },
];

/** 曲库搜索请求（UI 筛选状态口径，经 buildOsuBeatmapsetSearchQuery 转为请求参数）。 */
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

/**
 * UI 筛选状态 → 请求参数：
 * - m 恒为当前游戏模式（OSU_MODE_INT_BY_GAME_ID），玩家不可见不可改；
 * - c/e 点号连接常规/其他多选，仅在非空时携带；
 * - s/g/l 非默认（any/0）才携带；nsfw 恒携带（默认 false）；q/cursor_string 非空才携带。
 */
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

/** 搜索响应 → 曲库条目：标题/作者 unicode 优先；难度仅取当前模式全部 beatmaps（含转谱）并升序。 */
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

/**
 * beatmapset lookup 响应 → 歌曲详情 DTO：
 * - 标题/艺术家 unicode 优先；封面取方形卡片图优先（详情 Hero 为方形，card@2x 分辨率最合适）；
 * - 难度过滤口径与曲库 normalizeOsuCatalogSongs 完全一致（mode === ruleset || mode_int === modeInt），
 *   过滤后按星数从高到低排序（详情页轮播自高星起）；
 * - 全部数值属性 optionalNumber 容错，缺失归一化为 null。
 */
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
    beatmaps,
  };
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

/** 快照中的判定计数：可选字段（旧缓存无 statistics 时整体缺失），向后兼容不迁移。 */
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
        // 判定计数：上游缺失（旧版成绩）时整体归一化为 null，展示层显示 '—'。
        statistics: raw.statistics ? {
          perfect: optionalNumber(raw.statistics.perfect),
          great: optionalNumber(raw.statistics.great),
          good: optionalNumber(raw.statistics.good),
          ok: optionalNumber(raw.statistics.ok),
          meh: optionalNumber(raw.statistics.meh),
          miss: optionalNumber(raw.statistics.miss),
        } : null,
        // 达成时间：新版 ended_at 优先，legacy 回退 created_at。
        achievedAt: raw.ended_at ?? raw.created_at ?? null,
      }];
    }),
  };
}

// ---- 展示口径 ----

/** beatmapset 状态 → 中文标签（详情页简要信息栏「分类」列；未知状态展示层回退「未知」）。 */
export const OSU_STATUS_LABELS: Record<string, string> = {
  ranked: '上架',
  approved: '认可',
  qualified: '过审',
  loved: '社区喜爱',
  pending: '待定',
  wip: '制作中',
  graveyard: '坟场',
};

/**
 * 推荐星级（纯函数，不依赖上游 recommended_difficulty）：
 * - osu-taiko：pp^0.35 × 0.27；
 * - 其余三模式（standard/catch/mania）：pp^0.4 × 0.195；
 * - pp 为 null/undefined/非有限数/≤0（未绑定、未加载、无成绩）时返回 1★。
 */
export function recommendedOsuStar(gameId: OsuGameId, pp: number | null | undefined): number {
  if (pp == null || !Number.isFinite(pp) || pp <= 0) return 1;
  const base = gameId === 'osu-taiko' ? 0.35 : 0.4;
  const scale = gameId === 'osu-taiko' ? 0.27 : 0.195;
  return Math.pow(pp, base) * scale;
}

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
