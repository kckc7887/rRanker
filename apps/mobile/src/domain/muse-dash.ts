import { z } from 'zod';
import type { DataSource } from '@/domain/models';

export type MuseDashDifficultySlot = 'all' | 0 | 1 | 2 | 3 | 4;
export type MuseDashDlcFilter = 'all' | string;
export type MuseDashAchievementFilter = 'all' | 'fc' | 'ap';

/** 上游：https://api.musedash.moe。 */

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
  /** 上游谱师条目可能为 null。 */
  levelDesigner: z.array(z.string().nullable()).optional().default([]),
  /** 难度索引为 0–4；字符串 0 表示不存在，L/? 是特殊档位。 */
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

export const MuseDashDiffdiffEntrySchema = z.tuple([
  z.string(),
  z.number(),
  z.string(),
  z.number(),
  z.number(),
]);

export const MuseDashDiffdiffResponseSchema = z.array(MuseDashDiffdiffEntrySchema);

/** /ce 数组下标对应 character_uid / elfin_uid。 */
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

/** 搜索结果为 [昵称, user_id]。 */
export const MuseDashSearchResponseSchema = z.array(z.tuple([z.string(), z.string()]));

export type MuseDashSong = z.infer<typeof MuseDashSongSchema>;
export type MuseDashAlbum = z.infer<typeof MuseDashAlbumSchema>;
export type MuseDashAlbumsResponse = z.infer<typeof MuseDashAlbumsResponseSchema>;
export type MuseDashDiffdiffEntry = z.infer<typeof MuseDashDiffdiffEntrySchema>;
export type MuseDashCeResponse = z.infer<typeof MuseDashCeResponseSchema>;
export type MuseDashPlay = z.infer<typeof MuseDashPlaySchema>;
export type MuseDashPlayer = z.infer<typeof MuseDashPlayerSchema>;
export type MuseDashPlayDetail = z.infer<typeof MuseDashPlayDetailSchema>;

export type MuseDashRawScore = {
  play: MuseDashPlay;
  song: MuseDashSong | null;
  albumTitle: string;
  characterName: string | null;
  elfinName: string | null;
  /** 社区定数取 /diffdiff 的 relative。 */
  constant?: number;
};

export type MuseDashRandomChart = {
  key: string;
  song: MuseDashSong;
  albumTitle: string;
  difficultyIndex: number;
  officialLevel: string;
  constant?: number;
  score?: MuseDashRawScore;
};

export type MuseDashRandomChartFilters = {
  difficultySlot: 'all' | 0 | 1 | 2 | 3 | 4;
  dlc: 'all' | string;
  constantMin: string;
  constantMax: string;
  accMin: string;
  accMax: string;
  achievement: 'all' | 'fc' | 'ap';
};

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

export function museDashSongTitle(song: MuseDashSong): string {
  return song.ChineseS?.name?.trim() || song.name;
}

export function museDashSongAuthor(song: MuseDashSong): string {
  return song.ChineseS?.author?.trim() || song.author;
}

export function museDashDiffdiffMap(entries: readonly MuseDashDiffdiffEntry[]): Map<string, MuseDashDiffdiffEntry> {
  const map = new Map<string, MuseDashDiffdiffEntry>();
  for (const entry of entries) map.set(`${entry[0]}:${entry[1]}`, entry);
  return map;
}

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

export const MUSE_DASH_DIFFICULTY_LABELS = ['EASY', 'HARD', 'MASTER', 'HIDDEN', 'EX'] as const;

/** 只有确认 miss=0 才能判定 AP/FC。 */
export type MuseDashAchievement = 'AP' | 'FC';

export function resolveMuseDashAchievement(acc: number, miss: number | undefined): MuseDashAchievement | null {
  if (miss === undefined || miss > 0) return null;
  return acc >= 100 ? 'AP' : 'FC';
}

/** pending 可等待；failed 需重试；unknown 无 miss 字段，不能判定成就。 */
export type MuseDashMissDetail =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'unknown' }
  | { status: 'known'; miss: number };

export const MUSE_DASH_MISS_DETAIL_FAILED = 'failed';

/** 数字为 miss 数，null 为未返回，undefined 为上游缺失；失败使用哨兵。 */
export type MuseDashMissDetailValue = number | null | undefined | typeof MUSE_DASH_MISS_DETAIL_FAILED;

export function museDashMissDetail(value: MuseDashMissDetailValue): MuseDashMissDetail {
  if (value === MUSE_DASH_MISS_DETAIL_FAILED) return { status: 'failed' };
  if (value === null) return { status: 'pending' };
  return value === undefined ? { status: 'unknown' } : { status: 'known', miss: value };
}

export const MUSE_DASH_ACHIEVEMENT_FILTERS: readonly { value: 'all' | 'fc' | 'ap'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'fc', label: 'FC' },
  { value: 'ap', label: 'AP' },
];

export function museDashAchievementFilterLabel(filter: 'all' | 'fc' | 'ap'): string {
  return MUSE_DASH_ACHIEVEMENT_FILTERS.find((item) => item.value === filter)?.label ?? '全部';
}

export function matchesMuseDashAchievementFilter(
  acc: number,
  miss: number | undefined,
  filter: 'all' | 'fc' | 'ap',
): boolean {
  if (filter === 'all') return true;
  if (miss !== 0) return false;
  return filter === 'ap' ? acc >= 100 : true;
}

export function parseMuseDashConstantBound(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function matchesMuseDashConstantRange(constant: number, minInput: string, maxInput: string): boolean {
  const min = parseMuseDashConstantBound(minInput);
  const max = parseMuseDashConstantBound(maxInput);
  if (min !== undefined && constant < min) return false;
  if (max !== undefined && constant > max) return false;
  return true;
}

export function parseMuseDashAccBound(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
}

export function matchesMuseDashAccRange(acc: number, minInput: string, maxInput: string): boolean {
  const min = parseMuseDashAccBound(minInput);
  const max = parseMuseDashAccBound(maxInput);
  if (min !== undefined && acc < min) return false;
  if (max !== undefined && acc > max) return false;
  return true;
}

export function matchesMuseDashDifficultySlotFilter(
  availableSlots: readonly boolean[],
  difficulty: number,
  slot: 'all' | 0 | 1 | 2 | 3 | 4,
): boolean {
  return slot === 'all' || (slot === difficulty && (availableSlots[difficulty] ?? true));
}

export function matchesMuseDashDlcFilter(albumTitle: string, filter: 'all' | string): boolean {
  return filter === 'all' || albumTitle === filter;
}

export function museDashAccTone(acc: number): string {
  if (acc >= 100) return 'acc-gold';
  if (acc >= 95) return 'acc-silver';
  if (acc >= 90) return 'acc-red';
  if (acc >= 80) return 'acc-blue';
  if (acc >= 70) return 'acc-green';
  if (acc >= 60) return 'acc-gray';
  return 'acc-purple';
}

export function museDashGrade(acc: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (acc >= 90) return 'S';
  if (acc >= 80) return 'A';
  if (acc >= 70) return 'B';
  if (acc >= 60) return 'C';
  return 'D';
}

export function museDashRankBadge(rank: number): { label: string; tone: string } | null {
  if (!Number.isInteger(rank) || rank <= 0) return null;
  if (rank === 1) return { label: '#1', tone: 'rank-rainbow' };
  if (rank < 10) return { label: `#${rank}`, tone: 'rank-gold' };
  if (rank < 50) return { label: `#${rank}`, tone: 'rank-blue' };
  if (rank < 100) return { label: `#${rank}`, tone: 'rank-green' };
  return null;
}

export function museDashCoverUrl(cover: string | undefined): string | null {
  return cover ? `https://musedash.moe/covers/${encodeURIComponent(cover)}.webp` : null;
}

export function museDashSongsFromAlbums(albums: MuseDashAlbumsResponse): { song: MuseDashSong; albumTitle: string; albumTag?: string }[] {
  return Object.entries(albums).flatMap(([albumKey, album]) =>
    Object.values(album.music).map((song) => ({
      song,
      albumTitle: album.title,
      albumTag: album.tag ?? albumKey,
    })),
  );
}

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

export function buildMuseDashRawScores(
  player: MuseDashPlayer,
  albums: MuseDashAlbumsResponse | undefined,
  ce: MuseDashCeResponse | undefined,
  diffdiff: readonly MuseDashDiffdiffEntry[] | undefined,
): MuseDashRawScore[] {
  const songsByUid = albums ? museDashSongsByUid(albums) : new Map();
  const constants = diffdiff ? museDashDiffdiffMap(diffdiff) : null;
  return player.plays.map((play) => {
    const joined = songsByUid.get(play.uid);
    return {
      play,
      song: joined?.song ?? null,
      albumTitle: joined?.albumTitle ?? '未知专辑',
      characterName: ce ? museDashCharacterName(ce, play.character_uid) : null,
      elfinName: ce ? museDashElfinName(ce, play.elfin_uid) : null,
      constant: constants?.get(`${play.uid}:${play.difficulty}`)?.[4],
    };
  });
}

export function sortMuseDashRawScores(scores: readonly MuseDashRawScore[]): MuseDashRawScore[] {
  const rating = (value: number | undefined | null) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return [...scores].sort((left, right) => {
    const a = rating(left.play.sum);
    const b = rating(right.play.sum);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return b - a;
  });
}

/** 默认抽取包含未游玩谱面。 */
export function buildMuseDashRandomCharts(
  albums: MuseDashAlbumsResponse,
  diffdiff: readonly MuseDashDiffdiffEntry[],
  scores: readonly MuseDashRawScore[],
): MuseDashRandomChart[] {
  const constants = museDashDiffdiffMap(diffdiff);
  const scoresByChart = new Map(scores.map((score) => [
    `${score.play.uid}:${score.play.difficulty}`,
    score,
  ]));
  return museDashSongsFromAlbums(albums).flatMap(({ song, albumTitle }) =>
    song.difficulty.flatMap((officialLevel, difficultyIndex) => {
      if (officialLevel === '0') return [];
      const key = `${song.uid}:${difficultyIndex}`;
      return [{
        key,
        song,
        albumTitle,
        difficultyIndex,
        officialLevel,
        constant: constants.get(key)?.[4],
        score: scoresByChart.get(key),
      }];
    }));
}

export function filterMuseDashRandomCharts(
  charts: readonly MuseDashRandomChart[],
  filters: MuseDashRandomChartFilters,
  missByChart: ReadonlyMap<string, MuseDashMissDetailValue>,
): MuseDashRandomChart[] {
  const scoreFilterActive = filters.accMin.trim() !== ''
    || filters.accMax.trim() !== ''
    || filters.achievement !== 'all';
  return charts.filter((chart) => {
    if (filters.difficultySlot !== 'all' && chart.difficultyIndex !== filters.difficultySlot) return false;
    if (!matchesMuseDashDlcFilter(chart.albumTitle, filters.dlc)) return false;
    if (filters.constantMin.trim() !== '' || filters.constantMax.trim() !== '') {
      if (chart.constant === undefined
        || !matchesMuseDashConstantRange(chart.constant, filters.constantMin, filters.constantMax)) return false;
    }
    if (scoreFilterActive && !chart.score) return false;
    if (chart.score && !matchesMuseDashAccRange(chart.score.play.acc, filters.accMin, filters.accMax)) return false;
    if (filters.achievement !== 'all' && chart.score) {
      const detail = museDashMissDetail(missByChart.get(chart.key));
      if (detail.status !== 'known') return false;
      if (!matchesMuseDashAchievementFilter(chart.score.play.acc, detail.miss, filters.achievement)) return false;
    }
    return true;
  });
}

/** unknown 和 failed 不会自行更新，不能继续等待。 */
export function museDashAchievementDetailsPending(
  charts: readonly MuseDashRandomChart[],
  filters: MuseDashRandomChartFilters,
  missByChart: ReadonlyMap<string, MuseDashMissDetailValue>,
): boolean {
  if (filters.achievement === 'all') return false;
  return filterMuseDashRandomCharts(charts, { ...filters, achievement: 'all' }, missByChart)
    .some((chart) => chart.score !== undefined
      && museDashMissDetail(missByChart.get(chart.key)).status === 'pending');
}
