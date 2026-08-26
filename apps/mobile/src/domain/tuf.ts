import { z } from 'zod';
import type { DataSource } from '@/domain/models';

const nullableNumber = z.number().finite().nullable().optional();
const nullableString = z.string().nullable().optional();

export type TufAvatarSource = {
  avatar?: string | null;
  avatarUrl?: string | null;
  pfp?: string | null;
  user?: { avatarUrl?: string | null } | null;
};

/** TUF 同时在搜索结果与公开资料里使用过不同头像字段；统一在边界解析。 */
export function resolveTufAvatarUrl(player: TufAvatarSource | null | undefined): string | null {
  return player?.pfp?.trim()
    || player?.user?.avatarUrl?.trim()
    || player?.avatarUrl?.trim()
    || player?.avatar?.trim()
    || null;
}

export const TufDifficultySchema = z.object({
  id: z.number().int(), name: z.string().min(1), type: z.string().min(1),
  sortOrder: z.number().int().optional(), baseScore: nullableNumber,
  color: nullableString, icon: nullableString,
}).passthrough();

export const TufJudgementsSchema = z.object({
  earlyDouble: z.number().int().nonnegative().optional(),
  earlySingle: z.number().int().nonnegative().optional(),
  ePerfect: z.number().int().nonnegative().optional(),
  perfect: z.number().int().nonnegative().optional(),
  lPerfect: z.number().int().nonnegative().optional(),
  lateSingle: z.number().int().nonnegative().optional(),
  lateDouble: z.number().int().nonnegative().optional(),
}).passthrough();

const TufCreatorSchema = z.object({
  id: z.number().int().optional(), name: z.string().min(1),
}).passthrough();

const TufLevelCreditSchema = z.object({
  role: z.string().min(1), creator: TufCreatorSchema,
}).passthrough();

export const TufLevelSchema = z.object({
  id: z.number().int(),
  songId: z.number().int().nullable().optional(),
  song: z.string().min(1), artist: z.string().optional().default(''),
  diffId: z.number().int().nullable().optional(), baseScore: nullableNumber,
  bpm: nullableNumber, tilecount: z.number().int().nonnegative().nullable().optional(),
  autoTileCount: z.number().int().nonnegative().nullable().optional(),
  levelLengthInMs: z.number().finite().nonnegative().nullable().optional(),
  description: nullableString, downloadLink: nullableString, dlLink: nullableString,
  workshopLink: nullableString, videoLink: nullableString,
  isHidden: z.boolean().optional(), isDeleted: z.boolean().optional(),
  difficulty: TufDifficultySchema.nullable().optional(),
  levelCredits: z.array(TufLevelCreditSchema).optional().default([]),
  tags: z.array(z.union([
    z.string(),
    z.object({ id: z.number().int().optional(), name: z.string().min(1) }).passthrough(),
  ])).optional().default([]),
  curations: z.array(z.unknown()).optional().default([]),
  stats: z.record(z.string(), z.unknown()).optional(),
  clears: z.number().int().nonnegative().nullable().optional(),
  uniqueClears: z.number().int().nonnegative().nullable().optional(),
  likes: z.number().int().nonnegative().nullable().optional(),
  downloadCount: z.number().int().nonnegative().nullable().optional(),
}).passthrough();

export const TufPassSchema = z.object({
  id: z.number().int(), levelId: z.number().int(), scoreV2: z.number().finite(),
  accuracy: z.number().finite(), speed: z.number().finite(),
  vidUploadTime: z.string().nullable().optional(), videoLink: nullableString,
  isHidden: z.boolean().optional(), isWorldsFirst: z.boolean().nullable().optional(),
  isWorldsFirstPP: z.boolean().nullable().optional(), isDuplicate: z.boolean().optional(),
  impact: nullableNumber, judgements: TufJudgementsSchema.nullable().optional(),
  level: TufLevelSchema,
}).passthrough();

export const TufLevelPassSchema = TufPassSchema.omit({ level: true }).extend({
  playerId: z.number().int(),
}).passthrough();

const TufTopScoreSchema = z.object({ id: z.number().int(), impact: z.number().finite() }).passthrough();

export const TufPlayerSchema = z.object({
  id: z.number().int(), name: z.string().min(1), avatar: nullableString, avatarUrl: nullableString, pfp: nullableString,
  user: z.object({ avatarUrl: nullableString }).passthrough().nullable().optional(),
  discordId: nullableString, rankedScore: z.number().finite().optional().default(0),
  generalScore: z.number().finite().optional().default(0),
  ppScore: z.number().finite().optional().default(0), averageXacc: nullableNumber,
  globalRank: z.number().int().positive().nullable().optional(),
  rankedScoreRank: z.number().int().positive().nullable().optional(),
  rank: z.number().int().positive().nullable().optional(),
  totalPasses: z.number().int().nonnegative().optional().default(0),
  universalPassCount: z.number().int().nonnegative().optional().default(0),
  worldFirstCount: z.number().int().nonnegative().optional(),
  worldsFirstCount: z.number().int().nonnegative().optional(),
  topDiff: z.union([z.string(), z.number(), TufDifficultySchema]).nullable().optional(),
  topScores: z.array(TufTopScoreSchema).optional().default([]),
}).passthrough().transform((player) => ({
  ...player,
  avatarUrl: resolveTufAvatarUrl(player),
  globalRank: player.globalRank ?? player.rankedScoreRank ?? player.rank,
  worldFirstCount: player.worldFirstCount ?? player.worldsFirstCount ?? 0,
}));

export const TufPlayerSearchResponseSchema = z.object({
  total: z.number().int().nonnegative(), results: z.array(TufPlayerSchema),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
}).passthrough();
export const TufPassPageSchema = z.object({
  total: z.number().int().nonnegative(), passes: z.array(TufPassSchema),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
}).passthrough();
export const TufLevelPassListSchema = z.array(TufLevelPassSchema);
export const TufLevelPageSchema = z.object({
  total: z.number().int().nonnegative(), results: z.array(TufLevelSchema),
  limit: z.number().int().positive(), offset: z.number().int().nonnegative(),
  hasMore: z.boolean(), page: z.number().int().nonnegative().optional(),
}).passthrough();
export const TufLevelDetailResponseSchema = z.object({
  level: TufLevelSchema, rerateHistory: z.array(z.unknown()).optional().default([]),
}).passthrough();
export const TufDifficultyListSchema = z.array(TufDifficultySchema);
export const TufDifficultyHashSchema = z.object({ hash: z.string().min(1) }).passthrough();
export const TufVideoDetailsSchema = z.object({
  title: z.string(),
  channelName: z.string(),
  timestamp: nullableString,
  image: nullableString,
  embed: nullableString,
  downloadLink: nullableString,
}).passthrough();

export type TufDifficulty = z.infer<typeof TufDifficultySchema>;
export type TufJudgements = z.infer<typeof TufJudgementsSchema>;
export type TufLevel = z.infer<typeof TufLevelSchema>;
export type TufPass = z.infer<typeof TufPassSchema>;
export type TufLevelPass = z.infer<typeof TufLevelPassSchema>;
export type TufPlayer = z.infer<typeof TufPlayerSchema>;
export type TufPlayerSearchResponse = z.infer<typeof TufPlayerSearchResponseSchema>;
export type TufPassPage = z.infer<typeof TufPassPageSchema>;
export type TufLevelPage = z.infer<typeof TufLevelPageSchema>;
export type TufLevelDetailResponse = z.infer<typeof TufLevelDetailResponseSchema>;
export type TufVideoDetails = z.infer<typeof TufVideoDetailsSchema>;
export type TufPassSort = 'score' | 'speed' | 'date' | 'xacc' | 'difficulty' | 'impact';
export type TufSortOrder = 'ASC' | 'DESC';
export type TufLevelSort = 'RECENT' | 'DIFF' | 'CLEARS' | 'TOTAL_CLEARS' | 'LIKES' | 'BASESCORE' | 'BPM' | 'TILES' | 'TIME';
export type TufDifficultyBand = 'all' | 'P' | 'G' | 'U';
export type TufPassAchievementFilter = 'all' | 'wf' | 'pp';
export type TufDifficultyFilter = {
  band: TufDifficultyBand;
  min: number;
  max: number;
  includeSpecial: boolean;
};
export type TufPassQuery = {
  offset: number;
  limit: number;
  sortBy: TufPassSort;
  order: TufSortOrder;
  bestPerLevel: boolean;
  query?: string;
};
export type TufLevelQuery = {
  query?: string;
  offset: number;
  limit: number;
  sort?: TufLevelSort;
  order?: TufSortOrder;
  pguRange?: string;
  specialDifficulties?: readonly string[];
};
export const TUF_PAGE_SIZE = 30;
export const TUF_IMAGE_PROXY_URL = 'https://api.tuforums.com/v2/media/image-proxy';
export const TUF_TAG_ICON_COMMIT = '7a5b84eeea6fc0ce86d25da07d19595481a31d7e';
const TUF_TAG_ICON_BASE = `https://raw.githubusercontent.com/coyami-ke/TUFHelper/${TUF_TAG_ICON_COMMIT}/Assets/TUFHelper/Assets/Sprites/TagIcons`;

const TUF_TAG_ICON_FILES: Readonly<Record<string, string>> = {
  Pseudo: 'Icon_Playstyle_Pseudo.png',
  Rolling: 'Icon_Playstyle_Roll.png',
  Indexing: 'Icon_Playstyle_Index.png',
  Tech: 'Icon_Playstyle_Tech.png',
  'Key Count': 'Icon_Playstyle_Keycount.png',
  'Key Count+': 'Icon_Playstyle_KeycountPlus.png',
  Feetdex: 'Icon_Playstyle_Feetdex.png',
  'Feet Switch': 'Icon_Playstyle_Feetswitch.png',
  '1 Key Limit': 'Icon_Limit_1.png',
  '2 Key Limit': 'Icon_Limit_2.png',
  '4 Key Limit': 'Icon_Limit_4.png',
  '8 Key Limit': 'Icon_Limit_8.png',
  '10 Key Limit': 'Icon_Limit_10.png',
  '12 Key Limit': 'Icon_Limit_12.png',
  '16 Key Limit': 'Icon_Limit_16.png',
  'Overlay Allowed': 'Icon_Limit_Overlay.png',
  '2-Hand Pseudos': 'Icon_Limit_2Hand.png',
  'Onhand/Offhand Limit': 'Icon_Limit_Side.png',
  'Variable Key Limit': 'Icon_Limit_Change.png',
  'Judgement Limit': 'Icon_Judgment_Limit.png',
  'HP Bar': 'Icon_Judgment_HP.png',
  'Detailed Judgement': 'Icon_Judgment_Detail.png',
  'Free Roam': 'Icon_Gimmick_Freeroam.png',
  'Multi Track': 'Icon_Gimmick_Multi.png',
  Math: 'Icon_Gimmick_Math.png',
  RPG: 'Icon_Gimmick_RPG.png',
  Memorization: 'Icon_Gimmick_Memory.png',
  'Unorthodox Reading': 'Icon_Gimmick_Reading.png',
  'Arrow Key': 'Icon_Gimmick_Arrow.png',
  'Full VFX': 'Icon_VFX_FullVFX.png',
  Camera: 'Icon_VFX_Cam.png',
  Filters: 'Icon_VFX_Filter.png',
  'Non-VFX': 'Icon_VFX_NoVFX.png',
  Decorations: 'Icon_VFX_Deco.png',
  'Low VFX': 'Icon_VFX_LowVFX.png',
  Tiny: 'Icon_Time_Tiny.png',
  '30+ Seconds': 'Icon_Time_30s.png',
  '1+ Minute': 'Icon_Time_1m.png',
  '2+ Minutes': 'Icon_Time_2m.png',
  '3+ Minutes': 'Icon_Time_3m.png',
  '5+ Minutes': 'Icon_Time_5m.png',
  '7+ Minutes': 'Icon_Time_7m.png',
  '10+ Minutes': 'Icon_Time_10m.png',
  '15+ Minutes': 'Icon_Time_15m.png',
  '20+ Minutes': 'Icon_Time_20m.png',
  '30+ Minutes': 'Icon_Time_30m.png',
  '45+ Minutes': 'Icon_Time_45m.png',
  '1+ Hours': 'Icon_Time_1h.png',
  '1.5+ Hours': 'Icon_Time_15h.png',
  '2+ Hours': 'Icon_Time_2h.png',
  Timeless: 'Icon_Time_Infinity.png',
  'Youtube Stream': 'Icon_Mod_YSMod.png',
  'Key Limiter': 'Icon_Mod_Keylimit.png',
  DLC: 'Icon_DLC_DLC.png',
  Hold: 'Icon_DLC_Hold.png',
  'Multi Planet': 'Icon_DLC_MultiPlanet.png',
  'Pure Perfect Basescore Increase': 'Icon_Misc_PurePerfect.png',
  'Auto Tile': 'Icon_Misc_Auto.png',
  'Basescore Edit': 'Icon_Misc_Basescore.png',
};

function tufRangeValue(value: string, fallback: number): number {
  const parsed = /^\d{1,2}$/.test(value.trim()) ? Number(value) : fallback;
  return Math.min(20, Math.max(1, parsed));
}

export function tufDifficultyBounds(minValue: string, maxValue: string): { min: number; max: number } {
  const first = tufRangeValue(minValue, 1);
  const second = tufRangeValue(maxValue, 20);
  return { min: Math.min(first, second), max: Math.max(first, second) };
}

export function tufPguRange(filter: Pick<TufDifficultyFilter, 'band' | 'min' | 'max'>): string {
  const firstBand = filter.band === 'all' ? 'P' : filter.band;
  const lastBand = filter.band === 'all' ? 'U' : filter.band;
  return `${firstBand}${filter.min},${lastBand}${filter.max}`;
}

export function tufPassMatchesFilters(
  pass: TufPass,
  difficulty: TufDifficultyFilter,
  achievement: TufPassAchievementFilter = 'all',
): boolean {
  if (achievement === 'wf' && !pass.isWorldsFirst) return false;
  if (achievement === 'pp' && !pass.isWorldsFirstPP) return false;

  const match = pass.level.difficulty?.name.trim().toUpperCase().match(/^([PGU])(\d{1,2})$/);
  if (!match) return difficulty.includeSpecial;
  const band = match[1] as Exclude<TufDifficultyBand, 'all'>;
  const value = Number(match[2]);
  return (difficulty.band === 'all' || difficulty.band === band)
    && value >= difficulty.min
    && value <= difficulty.max;
}

export function filterTufPasses(
  passes: readonly TufPass[],
  difficulty: TufDifficultyFilter,
  achievement: TufPassAchievementFilter = 'all',
): TufPass[] {
  return passes.filter((pass) => tufPassMatchesFilters(pass, difficulty, achievement));
}

/** bestPerLevel 分页的防御性去重：保留上游排序中最先出现的每关最佳。 */
export function uniqueTufPassesByLevel(passes: readonly TufPass[]): TufPass[] {
  const byLevel = new Map<number, TufPass>();
  for (const pass of passes) {
    if (!byLevel.has(pass.levelId)) byLevel.set(pass.levelId, pass);
  }
  return [...byLevel.values()];
}

export function selectTufTopPasses(
  topScores: readonly { id: number; impact: number }[],
  passes: readonly TufPass[],
  limit = 20,
): { passes: TufPass[]; missing: number } {
  const requested = topScores.slice(0, Math.max(0, limit));
  const byId = new Map(passes.map((pass) => [pass.id, pass]));
  const selected = requested.flatMap((top) => {
    const pass = byId.get(top.id);
    return pass ? [{ ...pass, impact: top.impact }] : [];
  });
  return { passes: selected, missing: requested.length - selected.length };
}

const TUF_BAND_COLORS = { P: '#00C8FF', G: '#F2A700', U: '#7B4FB2' } as const;

export type TufDifficultyVisual = {
  band: 'P' | 'G' | 'U';
  background: string;
  border: string;
  text: '#FFFFFF' | '#172033';
};

function normalizedHex(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : null;
}

function darkenHex(value: string): string {
  const channels = [1, 3, 5].map((offset) => Math.round(Number.parseInt(value.slice(offset, offset + 2), 16) * 0.76));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function tufDifficultyVisual(
  difficulty: Pick<TufDifficulty, 'name' | 'type' | 'color'> | null | undefined,
): TufDifficultyVisual | null {
  const match = difficulty?.name.trim().toUpperCase().match(/^([PGU])(?:[1-9]|1\d|20)$/);
  if (!match || (difficulty?.type.trim().toUpperCase() !== 'PGU' && difficulty?.type.trim() !== '')) return null;
  const band = match[1] as TufDifficultyVisual['band'];
  const background = normalizedHex(difficulty?.color) ?? TUF_BAND_COLORS[band];
  const red = Number.parseInt(background.slice(1, 3), 16);
  const green = Number.parseInt(background.slice(3, 5), 16);
  const blue = Number.parseInt(background.slice(5, 7), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return { band, background, border: darkenHex(background), text: luminance >= 155 ? '#172033' : '#FFFFFF' };
}

export function tufTagIconUrl(tagName: string): string | null {
  const file = TUF_TAG_ICON_FILES[tagName.trim()];
  return file ? `${TUF_TAG_ICON_BASE}/${file}` : null;
}

export function selectBestTufLevelPass(
  passes: readonly TufLevelPass[],
  playerId: number | null,
): TufLevelPass | undefined {
  if (playerId === null) return undefined;
  return passes.filter((pass) => pass.playerId === playerId).sort((left, right) => (
    right.scoreV2 - left.scoreV2
    || right.accuracy - left.accuracy
    || (right.impact ?? Number.NEGATIVE_INFINITY) - (left.impact ?? Number.NEGATIVE_INFINITY)
    || right.id - left.id
  ))[0];
}

export function tufHttpsUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export type TufVideoPlatform = 'bilibili' | 'youtube';

export function tufVideoPlatform(value: string | null | undefined): TufVideoPlatform | null {
  const url = tufHttpsUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
  if (host === 'bilibili.com' || host.endsWith('.bilibili.com') || host === 'b23.tv') return 'bilibili';
  return null;
}

export function tufMediaImageCandidates(
  image: string | null | undefined,
  difficultyIcon: string | null | undefined,
): string[] {
  const candidates: string[] = [];
  const mediaImage = tufHttpsUrl(image);
  if (mediaImage) {
    const parsed = new URL(mediaImage);
    const alreadyProxied = parsed.hostname === 'api.tuforums.com'
      && parsed.pathname === '/v2/media/image-proxy';
    if (alreadyProxied) {
      candidates.push(mediaImage);
    } else {
      candidates.push(`${TUF_IMAGE_PROXY_URL}?url=${encodeURIComponent(mediaImage)}`, mediaImage);
    }
  }
  const icon = tufHttpsUrl(difficultyIcon);
  if (icon && !candidates.includes(icon)) candidates.push(icon);
  return candidates;
}

export type TufSongExtension = { level: TufLevel; upstreamSongId: number | null };
export type TufChartExtension = { level: TufLevel; upstreamSongId: number | null };
export type TufScoreExtension = {
  pass: TufPass; scoreV2: number; accuracy: number; speed: number;
  judgements: TufJudgements | null; isWorldsFirst: boolean | null;
  isWorldsFirstPP: boolean | null; isDuplicate: boolean; impact: number | null;
};

/**
 * TUF 缓存快照：resource_snapshots 表内独立命名空间 `tuf:`，
 * 每个游戏保留自己的缓存结构与 schema 版本，不复用其他游戏快照。
 * source 供 cacheFirstLoad 打「数据可能过期」标并保留 label 与拉取时间。
 */
export type TufPlayerSnapshot = { data: TufPlayer; source: DataSource };
export type TufPassPageSnapshot = { data: TufPassPage; source: DataSource };
export type TufLevelPageSnapshot = { data: TufLevelPage; source: DataSource };
export type TufLevelDetailSnapshot = { data: TufLevelDetailResponse; source: DataSource };
export type TufDifficultiesSnapshot = { data: TufDifficulty[]; source: DataSource };

export const TUF_PLAYER_SCHEMA_VERSION = 1;
export const TUF_PASS_PAGE_SCHEMA_VERSION = 1;
export const TUF_LEVEL_PAGE_SCHEMA_VERSION = 1;
export const TUF_LEVEL_SCHEMA_VERSION = 1;
export const TUF_DIFFICULTIES_SCHEMA_VERSION = 1;
export const TUF_LEVEL_HOME_CACHE_KEY = 'tuf:levels:home';

export function tufPlayerCacheKey(playerId: number): string {
  return `tuf:player:${playerId}`;
}
export function tufPassPageCacheKey(
  playerId: number,
  options: Omit<TufPassQuery, 'offset' | 'limit'>,
  offset: number,
): string {
  return `tuf:passes:${playerId}:${options.sortBy}:${options.order}:${options.bestPerLevel ? 1 : 0}:${encodeURIComponent(options.query ?? '')}:${offset}`;
}
export function tufLevelPageCacheKey(
  options: Omit<TufLevelQuery, 'offset' | 'limit'>,
  offset: number,
): string {
  return `tuf:levels:${encodeURIComponent(options.query ?? '')}:${options.sort ?? ''}:${options.order ?? ''}:${encodeURIComponent(options.pguRange ?? '')}:${encodeURIComponent((options.specialDifficulties ?? []).join(','))}:${offset}`;
}
export function tufLevelCacheKey(levelId: number): string {
  return `tuf:level:${levelId}`;
}
export const TUF_DIFFICULTIES_CACHE_KEY = 'tuf:difficulties';
