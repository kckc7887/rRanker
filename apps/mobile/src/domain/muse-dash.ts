import { z } from 'zod';
import type { DataSource } from '@/domain/models';

/**
 * Muse Dash 社区查分（https://api.musedash.moe）上游契约。
 * 每个字段保持上游原始语义，不与其他游戏合并；转换统一由 GameContentAdapter 完成。
 */

/** /albums 中单曲的多语言名称/作者；部分旧曲可能缺失。 */
const MuseDashLocalizedSchema = z.object({
  name: z.string().optional(),
  author: z.string().optional(),
}).passthrough();

export const MuseDashSongSchema = z.object({
  uid: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1),
  cover: z.string().optional(),
  bpm: z.string().optional(),
  /** 上游个别条目含 null 谱师，保留原样由适配器过滤。 */
  levelDesigner: z.array(z.string().nullable()).optional().default([]),
  /** 5 档难度，索引 0-4；字符串 "0" 表示该档不存在，部分特殊档位为非数字（如 "L"/"?"）。 */
  difficulty: z.array(z.string()).length(5).default(['0', '0', '0', '0', '0']),
  ChineseS: MuseDashLocalizedSchema.optional(),
  ChineseT: MuseDashLocalizedSchema.optional(),
  English: MuseDashLocalizedSchema.optional(),
  Japanese: MuseDashLocalizedSchema.optional(),
  Korean: MuseDashLocalizedSchema.optional(),
}).passthrough();

export const MuseDashAlbumSchema = z.object({
  title: z.string().min(1),
  json: z.string().optional(),
  tag: z.string().optional(),
  music: z.record(z.string(), MuseDashSongSchema).default({}),
}).passthrough();

export const MuseDashAlbumsResponseSchema = z.record(z.string(), MuseDashAlbumSchema);

/** /diffdiff 条目：[uid, difficulty, level, absolute, relative] */
export const MuseDashDiffdiffEntrySchema = z.tuple([
  z.string(),
  z.number(),
  z.string(),
  z.number(),
  z.number(),
]);

export const MuseDashDiffdiffResponseSchema = z.array(MuseDashDiffdiffEntrySchema);

/** /ce：角色（c）与精灵（e）的多语言名称表，数组下标即 character_uid / elfin_uid。 */
export const MuseDashCeResponseSchema = z.object({
  c: z.record(z.string(), z.array(z.string())),
  e: z.record(z.string(), z.array(z.string())),
}).passthrough();

export const MuseDashPlaySchema = z.object({
  score: z.number(),
  acc: z.number(),
  i: z.number().optional(),
  platform: z.string().optional(),
  history: z.object({ lastRank: z.number().optional() }).passthrough().optional(),
  difficulty: z.number().int().min(0).max(4),
  uid: z.string().min(1),
  sum: z.number().optional(),
  character_uid: z.string().optional(),
  elfin_uid: z.string().optional(),
}).passthrough();

export const MuseDashPlayerSchema = z.object({
  lastUpdate: z.number().optional(),
  rl: z.number().optional(),
  diffHistoryNumber: z.number().optional(),
  plays: z.array(MuseDashPlaySchema).default([]),
  user: z.object({
    object_id: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    user_id: z.string().min(1),
    nickname: z.string().min(1),
  }).passthrough(),
}).passthrough();

/** /rank/:uid/:difficulty/:platform/:id 单曲原始成绩明细（成就判定需要 miss 数）。 */
export const MuseDashPlayDetailSchema = z.object({
  play: z.object({
    acc: z.number().optional(),
    miss: z.number().optional(),
    judge: z.string().optional(),
    combo: z.number().optional(),
    score: z.number().optional(),
    character_uid: z.string().optional(),
    elfin_uid: z.string().optional(),
    platform: z.string().optional(),
  }).passthrough(),
  user: z.object({
    nickname: z.string().optional(),
  }).passthrough().optional(),
  now: z.number().optional(),
}).passthrough();

/** /search/:string 返回 [[昵称, user_id], ...]。 */
export const MuseDashSearchResponseSchema = z.array(z.tuple([z.string(), z.string()]));

export type MuseDashSong = z.infer<typeof MuseDashSongSchema>;
export type MuseDashAlbum = z.infer<typeof MuseDashAlbumSchema>;
export type MuseDashAlbumsResponse = z.infer<typeof MuseDashAlbumsResponseSchema>;
export type MuseDashDiffdiffEntry = z.infer<typeof MuseDashDiffdiffEntrySchema>;
export type MuseDashCeResponse = z.infer<typeof MuseDashCeResponseSchema>;
export type MuseDashPlay = z.infer<typeof MuseDashPlaySchema>;
export type MuseDashPlayer = z.infer<typeof MuseDashPlayerSchema>;
export type MuseDashPlayDetail = z.infer<typeof MuseDashPlayDetailSchema>;

/** 适配器扩展：保留上游原始字段，供展示层与详情页按需读取。 */
export type MuseDashSongExtension = {
  song: MuseDashSong;
  albumTitle: string;
  albumTag?: string;
  bpm?: string;
  cover?: string;
};
export type MuseDashChartExtension = {
  song: MuseDashSong;
  albumTitle: string;
  difficultyIndex: number;
  /** 官方等级字符串；"0" 视为不存在该难度。 */
  officialLevel: string;
  /** 社区定数（/diffdiff relative），无定数时为 undefined。 */
  constant?: number;
};
export type MuseDashScoreExtension = {
  play: MuseDashPlay;
  acc: number;
  currentRank: number;
  lastRank: number;
  sum: number;
  platform: string;
  characterName: string | null;
  elfinName: string | null;
};

/** normalizeScore 的原始输入：成绩 + 曲库 join 结果 + 角色/精灵名称（可能缺失）+ 社区定数。 */
export type MuseDashRawScore = {
  play: MuseDashPlay;
  song: MuseDashSong | null;
  albumTitle: string;
  characterName: string | null;
  elfinName: string | null;
  /** 社区定数（/diffdiff relative），无定数时为 undefined。 */
  constant?: number;
};

/** Muse Dash 缓存快照：独立命名空间 `musedash:`，不复用其他游戏快照。 */
export type MuseDashAlbumsSnapshot = { data: MuseDashAlbumsResponse; source: DataSource };
export type MuseDashCeSnapshot = { data: MuseDashCeResponse; source: DataSource };
export type MuseDashDiffdiffSnapshot = { data: MuseDashDiffdiffEntry[]; source: DataSource };
export type MuseDashPlayerSnapshot = { data: MuseDashPlayer; source: DataSource };
export type MuseDashPlayDetailSnapshot = { data: MuseDashPlayDetail; source: DataSource };

export const MUSE_DASH_ALBUMS_SCHEMA_VERSION = 1;
export const MUSE_DASH_CE_SCHEMA_VERSION = 1;
export const MUSE_DASH_DIFFDIFF_SCHEMA_VERSION = 1;
export const MUSE_DASH_PLAYER_SCHEMA_VERSION = 1;
export const MUSE_DASH_PLAY_DETAIL_SCHEMA_VERSION = 1;

export const MUSE_DASH_ALBUMS_CACHE_KEY = 'musedash:albums';
export const MUSE_DASH_CE_CACHE_KEY = 'musedash:ce';
export const MUSE_DASH_DIFFDIFF_CACHE_KEY = 'musedash:diffdiff';

export function museDashPlayerCacheKey(userId: string): string {
  return `musedash:player:${userId}`;
}

export function museDashPlayDetailCacheKey(
  userId: string,
  uid: string,
  difficulty: number,
  platform: string,
): string {
  return `musedash:detail:${userId}:${uid}:${difficulty}:${platform}`;
}

/** ChineseS 优先的歌曲名；缺失时回退原始字段。 */
export function museDashSongTitle(song: MuseDashSong): string {
  return song.ChineseS?.name?.trim() || song.name;
}

export function museDashSongAuthor(song: MuseDashSong): string {
  return song.ChineseS?.author?.trim() || song.author;
}

/** 定数表索引：`${uid}:${difficulty}` → 条目。 */
export function museDashDiffdiffMap(entries: readonly MuseDashDiffdiffEntry[]): Map<string, MuseDashDiffdiffEntry> {
  const map = new Map<string, MuseDashDiffdiffEntry>();
  for (const entry of entries) map.set(`${entry[0]}:${entry[1]}`, entry);
  return map;
}

/** 中文名优先的角色/精灵名称；uid 非数字或越界时返回 null。 */
export function museDashCharacterName(ce: MuseDashCeResponse, characterUid: string | undefined): string | null {
  if (!characterUid) return null;
  const names = ce.c.ChineseS;
  const index = Number(characterUid);
  if (!Array.isArray(names) || !Number.isInteger(index) || index < 0 || index >= names.length) return null;
  const name = names[index].trim();
  return name ? name : null;
}

export function museDashElfinName(ce: MuseDashCeResponse, elfinUid: string | undefined): string | null {
  if (!elfinUid) return null;
  const names = ce.e.ChineseS;
  const index = Number(elfinUid);
  if (!Array.isArray(names) || !Number.isInteger(index) || index < 0 || index >= names.length) return null;
  const name = names[index].trim();
  return name ? name : null;
}

/** 难度档位标签（Muse Dash 5 档：EASY/HARD/MASTER/HIDDEN/EX）。 */
export const MUSE_DASH_DIFFICULTY_LABELS = ['EASY', 'HARD', 'MASTER', 'HIDDEN', 'EX'] as const;

/** 成就：请求到的 miss 数为 0 时，ACC 100 为 AP、其余为 FC；有 miss 或无数据时为无。 */
export type MuseDashAchievement = 'AP' | 'FC';

export function resolveMuseDashAchievement(acc: number, miss: number | undefined): MuseDashAchievement | null {
  if (miss === undefined || miss > 0) return null;
  return acc >= 100 ? 'AP' : 'FC';
}

/** ACC 色阶：100 金、95 银、90 红、80 蓝、70 绿、60 灰、更低紫。 */
export function museDashAccTone(acc: number): string {
  if (acc >= 100) return 'acc-gold';
  if (acc >= 95) return 'acc-silver';
  if (acc >= 90) return 'acc-red';
  if (acc >= 80) return 'acc-blue';
  if (acc >= 70) return 'acc-green';
  if (acc >= 60) return 'acc-gray';
  return 'acc-purple';
}

/** 评价：90 以上 S、80 以上 A、70 B、60 C、更低 D；S 按 ACC 分金银红，其余沿用同档色。 */
export function museDashGrade(acc: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (acc >= 90) return 'S';
  if (acc >= 80) return 'A';
  if (acc >= 70) return 'B';
  if (acc >= 60) return 'C';
  return 'D';
}

/** 排名标签：#1 彩、<10 金、<50 蓝、<100 绿；排名缺失或 >=100 时无。 */
export function museDashRankBadge(rank: number): { label: string; tone: string } | null {
  if (!Number.isInteger(rank) || rank <= 0) return null;
  if (rank === 1) return { label: '#1', tone: 'rank-rainbow' };
  if (rank < 10) return { label: `#${rank}`, tone: 'rank-gold' };
  if (rank < 50) return { label: `#${rank}`, tone: 'rank-blue' };
  if (rank < 100) return { label: `#${rank}`, tone: 'rank-green' };
  return null;
}

/** 封面图 URL（musedash.moe 静态资源），无封面时返回 null。 */
export function museDashCoverUrl(cover: string | undefined): string | null {
  return cover ? `https://musedash.moe/covers/${encodeURIComponent(cover)}.webp` : null;
}

/** 把 albums 响应展开为带专辑信息的歌曲列表，保持上游顺序。 */
export function museDashSongsFromAlbums(albums: MuseDashAlbumsResponse): { song: MuseDashSong; albumTitle: string; albumTag?: string }[] {
  return Object.entries(albums).flatMap(([albumKey, album]) =>
    Object.values(album.music).map((song) => ({
      song,
      albumTitle: album.title,
      albumTag: album.tag ?? albumKey,
    })),
  );
}

/** 歌曲 uid → 带专辑信息歌曲的索引（成绩 join 曲库用）。 */
export function museDashSongsByUid(
  albums: MuseDashAlbumsResponse,
): Map<string, { song: MuseDashSong; albumTitle: string }> {
  const map = new Map<string, { song: MuseDashSong; albumTitle: string }>();
  for (const album of Object.values(albums)) {
    for (const song of Object.values(album.music)) {
      map.set(song.uid, { song, albumTitle: album.title });
    }
  }
  return map;
}
