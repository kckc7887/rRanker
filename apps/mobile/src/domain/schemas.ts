import { z } from 'zod';
import { normalizeMaimaiFc, normalizeMaimaiFs } from './maimai-filters';
import { DATA_SOURCE_KINDS, type CatalogSnapshot, type ChartType, type Difficulty, type ScoreRecord, type ScoreSnapshot } from './models';
import { calculateChartRating } from './rating';

/** Normalized snapshots, shared by their owning persistence boundaries. */
export const DataSourceSchema = z.object({
  kind: z.enum(DATA_SOURCE_KINDS), label: z.string(), updatedAt: z.string(), isStale: z.boolean(),
}).passthrough();
export const PlayerSchema = z.object({
  id: z.string(), displayName: z.string(), rating: z.number().finite(),
  extension: z.object({ kind: z.literal('maimai'), courseRank: z.number().finite().optional() }).optional(),
  presentation: z.object({
    iconId: z.number().finite().optional(), namePlateId: z.number().finite().optional(), frameId: z.number().finite().optional(),
    trophyName: z.string().optional(), trophyColor: z.string().nullable().optional(),
  }).optional(), source: DataSourceSchema,
}).passthrough();
const count = z.number().int().nonnegative();
const notes = z.object({ tap: count, hold: count, slide: count, touch: count, break: count, total: count });
const chartSchema = z.object({
  songId: z.string(), type: z.enum(['SD', 'DX', 'UTAGE']), levelIndex: count, level: z.string(),
  difficulty: z.enum(['basic', 'advanced', 'expert', 'master', 'remaster', 'utage', 'unknown']),
  difficultyConstant: z.number().finite(), charter: z.string().optional(), versionId: z.number().finite().optional(),
  notes: z.union([notes, z.object({ left: notes, right: notes }),
    z.object({ tap: count, hold: count, drag: count, flick: count, total: count })]).optional(),
  utage: z.object({ kanji: z.string().optional(), description: z.string().optional(), isBuddy: z.boolean() }).optional(),
}).passthrough();
export const ScoreRecordSchema = chartSchema.extend({
  title: z.string(), achievements: z.number().finite(), dxScore: z.number().finite().nullable(), rating: z.number().finite(),
  fc: z.string().nullable(), fs: z.string().nullable(), rate: z.string(), version: z.string(),
  rawDifficulty: z.string().optional(), rawFc: z.string().optional(), rawFs: z.string().optional(), rawRate: z.string().optional(),
  incomplete: z.boolean().optional(),
});
const versionSchema = z.object({ id: z.number().finite(), title: z.string() });
export const CatalogSnapshotSchema: z.ZodType<CatalogSnapshot> = z.object({
  currentVersion: versionSchema, versions: z.array(versionSchema),
  chartVersionIndex: z.record(z.string(), z.number().finite()), source: DataSourceSchema,
  songs: z.array(z.object({
    id: z.string(), title: z.string(), version: z.string(), charts: z.array(chartSchema),
    artist: z.string().optional(), illustrator: z.string().optional(), versionId: z.number().finite().optional(),
    bpm: z.number().finite().optional(), genre: z.string().optional(), region: z.string().optional(), rights: z.string().optional(),
    aliases: z.array(z.string()).optional(), locked: z.boolean().optional(), disabled: z.boolean().optional(),
  }).passthrough()),
}).passthrough();
export const ScoreSnapshotSchema: z.ZodType<ScoreSnapshot> = z.object({
  player: PlayerSchema, records: z.array(ScoreRecordSchema), source: DataSourceSchema, catalogSource: DataSourceSchema,
  best50: z.object({
    player: PlayerSchema, currentVersion: versionSchema, b35: z.array(ScoreRecordSchema), b15: z.array(ScoreRecordSchema),
    unmatchedRecordCount: count, rating: z.number().finite(), generatedAt: z.string(), source: DataSourceSchema,
  }).passthrough(),
}).passthrough();

function mapKnownFc(value: string | null | undefined): string | null {
  return normalizeMaimaiFc(value);
}

function mapKnownFs(value: string | null | undefined): string | null {
  return normalizeMaimaiFs(value);
}

function keepRawStatus(
  value: string | null | undefined,
  known: string | null,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || known) return undefined;
  // Sync Play 不作为产品成就展示，也不保留为 raw 回退
  if (trimmed.toLowerCase() === 'sync') return undefined;
  return trimmed;
}

export const DivingFishRecordSchema = z.object({
  achievements: z.number().finite().min(0),
  ds: z.number().finite().nonnegative(),
  dxScore: z.number().int().nonnegative().nullable(),
  fc: z.string().nullable().optional(), fs: z.string().nullable().optional(),
  level: z.string(), level_index: z.number().int().min(0), level_label: z.string().optional(),
  ra: z.number().int().nonnegative().optional(), rate: z.string(),
  song_id: z.union([z.number(), z.string()]), title: z.string(), type: z.string(), version: z.string().optional(),
}).passthrough();
export const DivingFishRecordsResponseSchema = z.object({
  additional_rating: z.number().int().nonnegative().optional(),
  nickname: z.string().optional(), plate: z.string().optional(),
  rating: z.number().int().nonnegative().optional(),
  records: z.array(DivingFishRecordSchema), username: z.string().optional(),
}).passthrough();

const DIFFICULTIES: Record<string, Difficulty> = {
  basic: 'basic', advanced: 'advanced', expert: 'expert', master: 'master',
  're:master': 'remaster', remaster: 'remaster',
};

export function mapDivingFishRecord(input: unknown, verifiedVersion?: string): ScoreRecord {
  const raw = DivingFishRecordSchema.parse(input);
  const rawDifficulty = raw.level_label?.toLowerCase() ?? '';
  const difficulty = DIFFICULTIES[rawDifficulty] ?? 'unknown';
  const fc = mapKnownFc(raw.fc);
  const fs = mapKnownFs(raw.fs);
  return {
    songId: String(raw.song_id), title: raw.title, type: raw.type.toUpperCase() === 'DX' ? 'DX' : 'SD',
    levelIndex: raw.level_index, level: raw.level, difficulty, difficultyConstant: raw.ds,
    achievements: raw.achievements, dxScore: raw.dxScore ?? null,
    rating: raw.ra ?? calculateChartRating(raw.ds, raw.achievements),
    fc, fs, rate: raw.rate,
    version: raw.version ?? verifiedVersion ?? 'unknown',
    rawDifficulty: difficulty === 'unknown' ? raw.level_label : undefined,
    rawFc: keepRawStatus(raw.fc, fc),
    rawFs: keepRawStatus(raw.fs, fs),
    rawRate: raw.rate,
  };
}

const LEVEL_INDEX_DIFFICULTY: Difficulty[] = ['basic', 'advanced', 'expert', 'master', 'remaster'];

export const LxnsEnvelopeSchema = z.object({
  success: z.boolean(),
  code: z.number().optional(),
  message: z.string().nullable().optional(),
  data: z.unknown().optional(),
}).passthrough();

const LxnsPlayerCollectionSchema = z.object({
  id: z.number().int(),
  name: z.string().optional(),
  color: z.string().nullable().optional(),
}).passthrough();

export const LxnsPlayerSchema = z.object({
  name: z.string(),
  rating: z.number().int().nonnegative(),
  friend_code: z.union([z.number(), z.string()]),
  course_rank: z.number().int().nonnegative().optional(),
  class_rank: z.number().int().nonnegative().optional(),
  trophy: LxnsPlayerCollectionSchema.nullable().optional(),
  icon: LxnsPlayerCollectionSchema.nullable().optional(),
  name_plate: LxnsPlayerCollectionSchema.nullable().optional(),
  frame: LxnsPlayerCollectionSchema.nullable().optional(),
}).passthrough();

export const LxnsScoreSchema = z.object({
  id: z.union([z.number(), z.string()]),
  song_name: z.string().optional(),
  level: z.string().optional(),
  level_index: z.number().int().min(0),
  achievements: z.number().finite().min(0),
  fc: z.string().nullable().optional(),
  fs: z.string().nullable().optional(),
  dx_score: z.number().int().nonnegative().nullable(),
  dx_rating: z.number().finite().nonnegative().optional(),
  rate: z.string().optional(),
  type: z.enum(['standard', 'dx', 'utage']),
}).passthrough();

function mapLxnsSongType(type: string): ChartType {
  const normalized = type.toLowerCase();
  if (normalized === 'dx') return 'DX';
  if (normalized === 'standard') return 'SD';
  if (normalized === 'utage') return 'UTAGE';
  throw new TypeError(`不支持的舞萌谱面类型：${type}`);
}

export function mapLxnsScore(input: unknown): ScoreRecord {
  const raw = LxnsScoreSchema.parse(input);
  const difficulty = raw.type === 'utage'
    ? 'utage'
    : LEVEL_INDEX_DIFFICULTY[raw.level_index] ?? 'unknown';
  const level = raw.level ?? String(raw.level_index);
  const title = raw.song_name?.trim();
  const ratingKnown = raw.type === 'utage' || raw.dx_rating !== undefined;
  const rateKnown = raw.rate !== undefined;
  const incomplete = !title || !ratingKnown || !rateKnown;
  const rating = raw.type === 'utage'
    ? 0
    : raw.dx_rating !== undefined
    ? Math.floor(raw.dx_rating)
    : 0;
  const fc = mapKnownFc(raw.fc);
  const fs = mapKnownFs(raw.fs);
  return {
    songId: String(raw.id),
    title: title || '曲名缺失',
    incomplete: incomplete || undefined,
    type: mapLxnsSongType(raw.type),
    levelIndex: raw.level_index,
    level,
    difficulty,
    difficultyConstant: 0,
    achievements: raw.achievements,
    dxScore: raw.dx_score,
    rating,
    fc,
    fs,
    rate: raw.rate ?? '',
    version: 'unknown',
    rawDifficulty: difficulty === 'unknown' ? level : undefined,
    rawFc: keepRawStatus(raw.fc, fc),
    rawFs: keepRawStatus(raw.fs, fs),
    rawRate: raw.rate,
  };
}
