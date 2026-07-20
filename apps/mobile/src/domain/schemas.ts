import { z } from 'zod';
import type { Difficulty, ScoreRecord } from './models';
import { calculateChartRating } from './rating';

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
  return {
    songId: String(raw.song_id), title: raw.title, type: raw.type.toUpperCase() === 'DX' ? 'DX' : 'SD',
    levelIndex: raw.level_index, level: raw.level, difficulty, difficultyConstant: raw.ds,
    achievements: raw.achievements, dxScore: raw.dxScore ?? null,
    rating: raw.ra ?? calculateChartRating(raw.ds, raw.achievements),
    fc: raw.fc ?? null, fs: raw.fs ?? null, rate: raw.rate,
    version: raw.version ?? verifiedVersion ?? 'unknown',
    rawDifficulty: difficulty === 'unknown' ? raw.level_label : undefined,
    rawFc: raw.fc && !['fc', 'fcp', 'ap', 'app'].includes(raw.fc.toLowerCase()) ? raw.fc : undefined,
    rawFs: raw.fs && !['sync', 'fs', 'fsp', 'fsd', 'fsdp'].includes(raw.fs.toLowerCase()) ? raw.fs : undefined,
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

function mapLxnsSongType(type: string): 'SD' | 'DX' {
  const normalized = type.toLowerCase();
  if (normalized === 'dx') return 'DX';
  if (normalized === 'standard') return 'SD';
  throw new TypeError('宴会场成绩不能映射为标准 SD/DX 谱面');
}

export function mapLxnsScore(input: unknown): ScoreRecord {
  const raw = LxnsScoreSchema.parse(input);
  const difficulty = LEVEL_INDEX_DIFFICULTY[raw.level_index] ?? 'unknown';
  const level = raw.level ?? String(raw.level_index);
  const rating = raw.dx_rating !== undefined
    ? Math.floor(raw.dx_rating)
    : calculateChartRating(0, raw.achievements);
  return {
    songId: String(raw.id),
    title: raw.song_name ?? `#${raw.id}`,
    type: mapLxnsSongType(raw.type),
    levelIndex: raw.level_index,
    level,
    difficulty,
    difficultyConstant: 0,
    achievements: raw.achievements,
    dxScore: raw.dx_score,
    rating,
    fc: raw.fc ?? null,
    fs: raw.fs ?? null,
    rate: raw.rate ?? '',
    version: 'unknown',
    rawDifficulty: difficulty === 'unknown' ? level : undefined,
    rawFc: raw.fc && !['fc', 'fcp', 'ap', 'app'].includes(raw.fc.toLowerCase()) ? raw.fc : undefined,
    rawFs: raw.fs && !['sync', 'fs', 'fsp', 'fsd', 'fsdp'].includes(raw.fs.toLowerCase()) ? raw.fs : undefined,
    rawRate: raw.rate,
  };
}
