import { z } from 'zod';
import type { Difficulty, ScoreRecord } from './models';
import { calculateChartRating } from './rating';

export const DivingFishRecordSchema = z.object({
  achievements: z.number().finite().min(0),
  ds: z.number().finite().nonnegative(),
  dxScore: z.number().int().nonnegative().nullable().optional(),
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
    rawFc: raw.fc && !['fc', 'fcp', 'ap', 'app'].includes(raw.fc) ? raw.fc : undefined,
    rawFs: raw.fs && !['sync', 'fs', 'fsp', 'fsd', 'fsdp'].includes(raw.fs) ? raw.fs : undefined,
    rawRate: raw.rate,
  };
}
